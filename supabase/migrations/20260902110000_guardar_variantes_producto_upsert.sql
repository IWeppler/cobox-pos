-- `guardar_variantes_producto_impl`: upsert por identidad en vez de
-- borrar+reinsertar todas las variantes del producto.
--
-- QUÉ PASABA. Cada guardado de un producto hacía
--
--   DELETE FROM producto_variantes WHERE producto_id = ...
--   (y después un INSERT por cada combinación del payload)
--
-- así que corregir el precio de un producto de 9 talles destruía 9 UUID y
-- creaba 9 nuevos. Las referencias a esos id que NO tienen FK quedaban
-- apuntando a la nada, sin error y sin log. Medido antes de este cambio:
--
--   ventas_items          174 de 1.791 renglones (9,7%) apuntan a un id muerto
--   movimientos_stock     439 de 6.409 filas (6,8%)
--   producto_variantes    306 de 3.468 id vistos en el log ya no existen
--
-- Lo de `ventas_items` es lo peor: esa columna se agregó en 20260816130000
-- justamente para que anular una venta devuelva el stock POR ID y no por
-- nombre. Con el id muerto, la anulación devuelve el stock a ningún lado — el
-- mismo bug que esa migración vino a cerrar, entrando por otra puerta. Sumados
-- los 117 que ya estaban en NULL, son 291 de 1.791 renglones (16%) que no
-- pueden reponer mercadería de forma confiable.
--
-- Y las que SÍ tienen FK no se salvaban, se rompían distinto: en
-- `actualizaciones_precio_items` el ON DELETE es SET NULL y hay 2.517 de 6.122
-- filas (41%) con el id ya en null; en `reservas` y `unidades_serie` es
-- CASCADE, o sea que editar un precio borra reservas activas y unidades con
-- IMEI. Esas dos tienen 5 filas entre las seis bases, así que el daño está sin
-- estrenar — pero se estrena solo en cuanto electro cargue IMEIs.
--
-- POR QUÉ ERA ASÍ, Y POR QUÉ SE PUEDE CAMBIAR AHORA. El borrado+reinserción es
-- anterior a esta RPC: viene de `editarProductoAction` y 20260719160000 no lo
-- introdujo, lo envolvió en una transacción. La razón mecánica es que el
-- payload del formulario NO trae `id` — el form arma el producto cartesiano de
-- opciones desde cero, así que la RPC recibe combinaciones, no filas.
--
-- Pero eso ya está resuelto desde 20260818140000, que creó
-- `atributos_comparables(jsonb)` y lo usa acá mismo para machear cada entrante
-- con la existente y arrastrarle el stock. O sea que la función YA sabía cuál
-- era cuál: hacía el match, le copiaba el stock, y tiraba la fila igual. Esa
-- misma migración lo dejó anotado: "Unificar variantes por id es otro cambio,
-- más grande". Es este.
--
-- QUÉ CAMBIA, exactamente:
--
--   entrante CON match  -> UPDATE de la fila existente (conserva el id)
--   entrante SIN match  -> INSERT, igual que antes
--   existente sin match -> DELETE de esa fila sola, no de todas
--
-- QUÉ NO CAMBIA, y es a propósito:
--
--   * El FRENO de faltantes no confirmadas queda idéntico, incluida la regla
--     de que solo bloquean las que tienen stock. Es la red que evita perder
--     mercadería y no se toca en el mismo cambio que mueve la escritura.
--   * La firma es la misma, así que NO hay diff de TypeScript: el payload
--     sigue sin `id` y `edit-product.ts` no se entera.
--   * Sigue SECURITY INVOKER. El aislamiento entre negocios tiene que seguir
--     siendo la RLS del que llama.
--   * El wrapper `guardar_variantes_producto` NO se toca. Sigue apagando el
--     trigger y escribiendo el movimiento NETO comparando antes contra
--     después. Con upsert ese cálculo sigue dando lo mismo (compara stock por
--     clave, no por id), así que `movimientos_stock` no cambia en nada. Sacar
--     esa suspensión ahora que el UPDATE es real es una mejora posible, pero
--     cambia lo que se escribe en una tabla que ya alimenta señales: va aparte.
--
-- EFECTO EN LA AUDITORÍA. Las filas 'ACTUALIZADA' pasan a tener
-- `variante_id_anterior = variante_id_nueva`, porque ahora es literalmente la
-- misma fila. Antes eran distintos y esa diferencia es, hoy, el único mapa
-- viejo->nuevo que existe para recuperar los huérfanos ya creados (3.277
-- pares, hasta 10 saltos de profundidad). El mapa histórico no se toca —
-- seguirá sirviendo para el backfill del paso 3— y a partir de acá deja de
-- crecer, que es el objetivo.
--
-- REVERSIBLE: es un `create or replace` de una función. El cuerpo anterior
-- está completo en el archivo `_down` hermano.

create or replace function public.guardar_variantes_producto_impl(
  p_producto_id uuid,
  p_negocio_id uuid,
  p_variantes jsonb,
  p_editado_por uuid,
  p_confirmadas_eliminar jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
DECLARE
  v_existentes jsonb;
  -- Sigue siendo int: cuenta variantes bloqueadas, no mercadería.
  v_faltantes_no_confirmados int := 0;
  v_existente jsonb;
  v_nueva jsonb;
  v_new_id uuid;
  v_stock_input text;
  -- ERA `int`. Con integer, 7.000 (siete kilos) no entra.
  v_stock numeric(12,3);
  v_relacion jsonb;
  v_auditoria jsonb[] := '{}';
  v_confirmada boolean;
  -- Las claves que el payload SÍ trae. Lo que no esté acá y exista hoy es una
  -- variante que se va: se borra al final, de a una.
  v_claves_entrantes text[] := '{}';
BEGIN
  IF p_negocio_id IS NULL THEN
    RAISE EXCEPTION 'guardar_variantes_producto requiere un negocio activo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.productos
    WHERE id = p_producto_id AND negocio_id = p_negocio_id
  ) THEN
    RAISE EXCEPTION 'El producto no pertenece al negocio activo';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', pv.id,
           'atributos', pv.atributos,
           'clave', public.atributos_comparables(pv.atributos),
           'nombre_display', pv.nombre_display,
           'precio', pv.precio,
           'costo', pv.costo,
           'stock', pv.stock
         )), '[]'::jsonb)
    INTO v_existentes
    FROM public.producto_variantes pv
    WHERE pv.producto_id = p_producto_id
      AND pv.negocio_id = p_negocio_id;

  -- FRENO. Cualquier variante existente que se quede sin match en el payload
  -- es una que va a desaparecer, y si tiene stock eso es mercadería que se
  -- borra sin que nadie lo haya pedido. Solo bloquean las que TIENEN stock.
  FOR v_existente IN SELECT * FROM jsonb_array_elements(v_existentes)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_variantes) AS nv
      WHERE public.atributos_comparables(nv->'atributos') = (v_existente->>'clave')
    ) THEN
      v_confirmada := EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_confirmadas_eliminar) AS ce
        WHERE public.atributos_comparables(ce) = (v_existente->>'clave')
      );

      IF NOT v_confirmada AND coalesce((v_existente->>'stock')::numeric, 0) > 0 THEN
        v_faltantes_no_confirmados := v_faltantes_no_confirmados + 1;

        INSERT INTO public.producto_variantes_auditoria (
          negocio_id, producto_id, variante_id_anterior, variante_id_nueva,
          atributos, nombre_display, accion, stock_anterior, stock_nuevo,
          precio_anterior, precio_nuevo, costo_anterior, costo_nuevo,
          editado_por
        ) VALUES (
          p_negocio_id,
          p_producto_id,
          (v_existente->>'id')::uuid,
          NULL,
          v_existente->'atributos',
          v_existente->>'nombre_display',
          'BLOQUEADO_FALTANTE',
          (v_existente->>'stock')::numeric,
          NULL,
          (v_existente->>'precio')::numeric,
          NULL,
          (v_existente->>'costo')::numeric,
          NULL,
          p_editado_por
        );
      END IF;
    END IF;
  END LOOP;

  IF v_faltantes_no_confirmados > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'faltantes', v_faltantes_no_confirmados
    );
  END IF;

  -- El espejo legacy SÍ se sigue borrando entero y reescribiendo: no tiene id
  -- estable ni nada que lo referencie, su clave es el texto `variante`, y es
  -- un derivado de producto_variantes. Conservarle la fila no aportaría nada.
  DELETE FROM public.productos_stock
   WHERE producto_id = p_producto_id AND negocio_id = p_negocio_id;

  FOR v_nueva IN SELECT * FROM jsonb_array_elements(p_variantes)
  LOOP
    SELECT ve INTO v_existente
      FROM jsonb_array_elements(v_existentes) AS ve
      WHERE (ve->>'clave') = public.atributos_comparables(v_nueva->'atributos')
      LIMIT 1;

    v_claves_entrantes := v_claves_entrantes
      || public.atributos_comparables(v_nueva->'atributos');

    v_stock_input := NULLIF(trim(v_nueva->>'stock_input'), '');
    IF v_stock_input IS NOT NULL THEN
      -- La coma se acepta como decimal: el input del formulario la deja
      -- tipear y '7,5'::numeric sería otro 22P02 con la dueña adelante.
      v_stock := replace(v_stock_input, ',', '.')::numeric;
    ELSE
      v_stock := coalesce((v_existente->>'stock')::numeric, 0);
    END IF;

    IF v_existente IS NULL THEN
      -- Alta genuina: esta combinación no existía.
      INSERT INTO public.producto_variantes (
        negocio_id, producto_id, nombre_display, atributos, precio, costo, stock, sku
      ) VALUES (
        p_negocio_id,
        p_producto_id,
        v_nueva->>'nombre_display',
        v_nueva->'atributos',
        NULLIF(v_nueva->>'precio', '')::numeric,
        NULLIF(v_nueva->>'costo', '')::numeric,
        v_stock,
        NULLIF(v_nueva->>'sku', '')
      )
      RETURNING id INTO v_new_id;
    ELSE
      -- El cambio de esta migración: la misma fila, con el mismo id.
      --
      -- `atributos` se pisa igual aunque la CLAVE sea la misma: el match es
      -- por la forma normalizada, así que "COLOR: NEGRO" y "Color: Negro"
      -- machean, y lo que hay que guardar es la versión canonicalizada que
      -- llega en el payload. Ese es justo el guardado que antes rompía el
      -- stock (ver 20260818140000).
      UPDATE public.producto_variantes
         SET nombre_display = v_nueva->>'nombre_display',
             atributos      = v_nueva->'atributos',
             precio         = NULLIF(v_nueva->>'precio', '')::numeric,
             costo          = NULLIF(v_nueva->>'costo', '')::numeric,
             stock          = v_stock,
             sku            = NULLIF(v_nueva->>'sku', ''),
             updated_at     = now()
       WHERE id = (v_existente->>'id')::uuid
      RETURNING id INTO v_new_id;

      -- Las relaciones no tienen identidad propia más allá de la tripleta, así
      -- que para la fila que sobrevive se reemplazan. Antes se iban por CASCADE
      -- con el DELETE masivo; ahora hay que sacarlas a mano.
      DELETE FROM public.producto_variante_valores
       WHERE variante_id = v_new_id;
    END IF;

    FOR v_relacion IN SELECT * FROM jsonb_array_elements(coalesce(v_nueva->'relaciones', '[]'::jsonb))
    LOOP
      INSERT INTO public.producto_variante_valores (
        negocio_id, variante_id, atributo_id, atributo_valor_id
      )
      VALUES (
        p_negocio_id,
        v_new_id,
        (v_relacion->>'atributo_id')::uuid,
        (v_relacion->>'atributo_valor_id')::uuid
      );
    END LOOP;

    INSERT INTO public.productos_stock (negocio_id, producto_id, variante, cantidad)
    VALUES (p_negocio_id, p_producto_id, v_nueva->>'nombre_display', v_stock);

    v_auditoria := v_auditoria || jsonb_build_object(
      'producto_id', p_producto_id,
      'variante_id_anterior', v_existente->>'id',
      'variante_id_nueva', v_new_id,
      'atributos', v_nueva->'atributos',
      'nombre_display', v_nueva->>'nombre_display',
      'accion', CASE WHEN v_existente IS NULL THEN 'CREADA' ELSE 'ACTUALIZADA' END,
      'stock_anterior', v_existente->>'stock',
      'stock_nuevo', v_stock,
      'precio_anterior', v_existente->>'precio',
      'precio_nuevo', NULLIF(v_nueva->>'precio', ''),
      'costo_anterior', v_existente->>'costo',
      'costo_nuevo', NULLIF(v_nueva->>'costo', ''),
      'editado_por', p_editado_por
    );

    v_existente := NULL;
  END LOOP;

  -- Las que se van. Antes desaparecían dentro del DELETE masivo del principio;
  -- ahora hay que borrarlas explícitamente, y solo a ellas. Llegar hasta acá
  -- significa que el freno de arriba ya las dejó pasar: o no tienen stock, o
  -- están en `p_confirmadas_eliminar`.
  FOR v_existente IN SELECT * FROM jsonb_array_elements(v_existentes)
  LOOP
    IF NOT ((v_existente->>'clave') = ANY (v_claves_entrantes)) THEN
      DELETE FROM public.producto_variantes
       WHERE id = (v_existente->>'id')::uuid;

      v_auditoria := v_auditoria || jsonb_build_object(
        'producto_id', p_producto_id,
        'variante_id_anterior', v_existente->>'id',
        'variante_id_nueva', NULL,
        'atributos', v_existente->'atributos',
        'nombre_display', v_existente->>'nombre_display',
        'accion', 'ELIMINADA',
        'stock_anterior', v_existente->>'stock',
        'stock_nuevo', NULL,
        'precio_anterior', v_existente->>'precio',
        'precio_nuevo', NULL,
        'costo_anterior', v_existente->>'costo',
        'costo_nuevo', NULL,
        'editado_por', p_editado_por
      );
    END IF;
  END LOOP;

  INSERT INTO public.producto_variantes_auditoria (
    negocio_id, producto_id, variante_id_anterior, variante_id_nueva, atributos,
    nombre_display, accion, stock_anterior, stock_nuevo,
    precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, editado_por
  )
  SELECT
    p_negocio_id,
    (a->>'producto_id')::uuid,
    (a->>'variante_id_anterior')::uuid,
    (a->>'variante_id_nueva')::uuid,
    a->'atributos',
    a->>'nombre_display',
    a->>'accion',
    (a->>'stock_anterior')::numeric,
    (a->>'stock_nuevo')::numeric,
    (a->>'precio_anterior')::numeric,
    (a->>'precio_nuevo')::numeric,
    (a->>'costo_anterior')::numeric,
    (a->>'costo_nuevo')::numeric,
    (a->>'editado_por')::uuid
  FROM unnest(v_auditoria) AS a;

  RETURN jsonb_build_object('success', true, 'blocked', false);
END;
$function$;

comment on function public.guardar_variantes_producto_impl(uuid, uuid, jsonb, uuid, jsonb) is
  'Guarda las variantes de un producto haciendo UPSERT por identidad (atributos_comparables), no borrando y reinsertando: los UUID de variante sobreviven a la edición. Ver 20260902110000.';
