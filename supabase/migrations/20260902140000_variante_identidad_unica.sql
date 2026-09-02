-- La identidad de una variante pasa a ser una garantía de la base, no una
-- promesa del código: índice único sobre
-- (negocio_id, producto_id, atributos_comparables(atributos)).
--
-- Es el paso 2 del trabajo que arrancó en 20260902100000. El 0 fusionó la
-- única duplicada que había y el 1 hizo que el guardado actualice en vez de
-- borrar y reinsertar. Sin índice, esa invariante depende de que nadie escriba
-- por otro lado.
--
-- VAN LAS DOS COSAS EN LA MISMA MIGRACIÓN, y el orden importa: primero se
-- tapa el agujero que todavía deja pasar duplicados, después se pone el
-- índice. Al revés, el agujero dejaría de producir un duplicado silencioso
-- para producir un error 23505 crudo en la cara de quien está guardando.
--
-- EL AGUJERO. Medido sobre la RPC ya con upsert: si el payload trae dos
-- entradas con la MISMA identidad canónica y ninguna de las dos machea una
-- variante existente, se insertan las dos. Verificado en producción (en
-- transacción revertida): dos combinaciones nuevas {Color: Fucsia, Talle: XXL}
-- y {COLOR: FUCSIA, TALLE: XXL} entran como dos filas.
--
-- No es hipotético: el form arma el producto cartesiano de opciones × valores,
-- y `canonicalizarValores` colapsa "Negro" y "NEGRO" al mismo valor canónico
-- DESPUÉS de que el usuario los cargó como dos valores distintos del mismo
-- atributo. Es la explicación más simple de "CARGO IMPERMEABLE 2 EN 1", cuyas
-- dos filas idénticas nacieron con 114 ms de diferencia.
--
-- Ojo con lo que NO lo tapaba: `productos_stock` tiene un unique sobre
-- (producto_id, variante), pero es sobre el TEXTO del nombre. Dos filas con la
-- misma identidad y distinto `nombre_display` ("Fucsia / XXL" y
-- "FUCSIA / XXL") lo pasan de largo.
--
-- LA REGLA QUE SE ADOPTA: dentro de una misma llamada, la primera aparición de
-- cada identidad gana y las siguientes se ignoran. Dos entradas con la misma
-- identidad SON la misma variante, así que la segunda no es un dato nuevo:
-- aplicarla sería pisar el stock recién escrito con el de una fila que el
-- usuario ve como otra cosa. De paso arregla un 23505 que ya existía hoy: con
-- nombres iguales, la segunda entrada reventaba contra el unique de
-- `productos_stock` y volteaba el guardado entero.

begin;

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
  v_faltantes_no_confirmados int := 0;
  v_existente jsonb;
  v_nueva jsonb;
  v_new_id uuid;
  v_stock_input text;
  v_stock numeric(12,3);
  v_relacion jsonb;
  v_auditoria jsonb[] := '{}';
  v_confirmada boolean;
  v_claves_entrantes text[] := '{}';
  v_clave text;
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

  DELETE FROM public.productos_stock
   WHERE producto_id = p_producto_id AND negocio_id = p_negocio_id;

  FOR v_nueva IN SELECT * FROM jsonb_array_elements(p_variantes)
  LOOP
    v_clave := public.atributos_comparables(v_nueva->'atributos');

    -- Ya se escribió una fila para esta identidad en esta misma llamada. Ver
    -- el encabezado: la primera gana, esta se ignora.
    CONTINUE WHEN v_clave = ANY (v_claves_entrantes);

    SELECT ve INTO v_existente
      FROM jsonb_array_elements(v_existentes) AS ve
      WHERE (ve->>'clave') = v_clave
      LIMIT 1;

    v_claves_entrantes := v_claves_entrantes || v_clave;

    v_stock_input := NULLIF(trim(v_nueva->>'stock_input'), '');
    IF v_stock_input IS NOT NULL THEN
      v_stock := replace(v_stock_input, ',', '.')::numeric;
    ELSE
      v_stock := coalesce((v_existente->>'stock')::numeric, 0);
    END IF;

    IF v_existente IS NULL THEN
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

-- El índice. `atributos_comparables` es IMMUTABLE (lo es desde
-- 20260818140000), que es lo que permite indexarla.
--
-- OJO AL TOCAR ESA FUNCIÓN: si cambia lo que devuelve, este índice queda
-- inconsistente con los datos y Postgres NO se entera. Cualquier cambio en
-- `atributos_comparables` obliga a un REINDEX de esto.
--
-- No va CONCURRENTLY: son 5.746 filas, el lock dura milisegundos, y
-- CONCURRENTLY no puede correr adentro del bloque transaccional en el que se
-- aplica esta migración — que es justo lo que se quiere, que el índice y el
-- arreglo del writer entren o no entren juntos.
create unique index if not exists idx_variante_identidad
  on public.producto_variantes
     (negocio_id, producto_id, (public.atributos_comparables(atributos)));

comment on index public.idx_variante_identidad is
  'La identidad de una variante: sus atributos normalizados, dentro de su producto. Es lo que permite que guardar_variantes_producto haga UPSERT en vez de borrar y reinsertar (20260902110000). Si se toca atributos_comparables(), hay que hacer REINDEX.';

commit;
