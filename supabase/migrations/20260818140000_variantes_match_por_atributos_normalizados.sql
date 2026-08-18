-- Editar un producto le cambiaba el stock a sus variantes.
--
-- `guardar_variantes_producto` borra y reinserta todas las variantes, y para
-- saber qué stock le corresponde a cada una compara los atributos con
-- igualdad JSONB EXACTA:
--
--   (ve->'atributos') = (nv->'atributos')
--
-- Eso es byte a byte. `{"Color":"NEGRO"}` y `{"Color":"Negro"}` son la misma
-- variante para cualquier persona y dos variantes distintas para esa
-- comparación. Cuando no matchea, la vieja se registra como ELIMINADA, la
-- nueva como CREADA, y el stock de la nueva sale de la grilla del formulario
-- en vez de la variante que en realidad es.
--
-- Lo peor es de dónde viene la diferencia de mayúsculas: la produce el propio
-- sistema. `canonicalizarValores` normaliza "NEGRO" a "Negro" antes de mandar
-- el payload —que es lo correcto— pero la RPC compara ese valor ya canónico
-- contra el que está guardado, que es el viejo sin normalizar. O sea que el
-- guardado que ARREGLA el casing es el que rompe el stock.
--
-- Casos reales encontrados en la auditoría:
--
--   31/7, Evens: 4 variantes de un mismo producto, TALLE/COLOR/GÉNERO en
--   mayúsculas contra las mismas en capitalizado. Las 4 se borraron y se
--   recrearon; la de talle 40 pasó de 1 a 0.
--   7/8, Estilo Bonito: {Color: Surtido} pasó a {Color: Surtido, Género: Bebé}
--   al agregarle el género. La vieja tenía 9 unidades, la nueva quedó con 14.
--
-- Y el freno que existe justamente para esto no se entera: solo mira si el
-- payload trae MENOS combinaciones que las que hay. Con un renombre las
-- cuentas dan iguales (una desaparece, una aparece), así que pasa de largo.
--
-- Dos cambios:
--
--   1. El match es por atributos NORMALIZADOS (minúsculas, sin tildes, claves
--      ordenadas). Misma idea que el slugify que ya usa la canonicalización
--      del lado de Node — la comparación tiene que ser tan tolerante como la
--      normalización que la precede, o corrige el dato y pierde el stock.
--   2. El freno se dispara cuando CUALQUIER variante con stock se queda sin
--      match, no solo cuando bajó el total. Que las cuentas cierren no
--      significa que sean las mismas variantes.
--
-- Lo que NO cambia: sigue siendo borrar y reinsertar, y sigue siendo SECURITY
-- INVOKER. Unificar variantes por id es otro cambio, más grande.

-- Clave comparable de un conjunto de atributos: "color=negro|talle=42".
-- `translate` y no `unaccent()`: la función de la extensión depende de un
-- diccionario que se resuelve por search_path, y esta RPC corre con
-- search_path vacío a propósito.
create or replace function public.atributos_comparables(p_atributos jsonb)
returns text
language sql
immutable
set search_path to ''
as $$
  select coalesce(
    string_agg(
      translate(lower(clave), 'áéíóúüñ', 'aeiouun')
        || '=' ||
        translate(lower(valor), 'áéíóúüñ', 'aeiouun'),
      '|' order by translate(lower(clave), 'áéíóúüñ', 'aeiouun')
    ),
    ''
  )
  from jsonb_each_text(coalesce(p_atributos, '{}'::jsonb)) as t(clave, valor)
$$;

comment on function public.atributos_comparables(jsonb) is
  'Clave normalizada de un conjunto de atributos de variante, para comparar "COLOR: NEGRO" con "Color: Negro" como lo mismo. La igualdad JSONB directa es byte a byte y hacía que un cambio de mayúsculas borrara y recreara la variante, perdiéndole el stock.';

CREATE OR REPLACE FUNCTION public.guardar_variantes_producto(
  p_producto_id uuid,
  p_negocio_id uuid,
  p_variantes jsonb,
  p_editado_por uuid,
  p_confirmadas_eliminar jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_existentes jsonb;
  v_faltantes_no_confirmados int := 0;
  v_existente jsonb;
  v_nueva jsonb;
  v_new_id uuid;
  v_stock_input text;
  v_stock int;
  v_relacion jsonb;
  v_auditoria jsonb[] := '{}';
  v_confirmada boolean;
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

  -- FRENO. Ya no depende de que bajen las cuentas: cualquier variante
  -- existente que se quede sin match en el payload es una que va a
  -- desaparecer, y si tiene stock eso es mercadería que se borra sin que
  -- nadie lo haya pedido. Las confirmadas en el modal pasan; el resto
  -- bloquea el guardado entero.
  --
  -- Solo bloquean las que TIENEN stock: una variante agotada que desaparece
  -- no destruye nada, y frenar por eso convertiría el freno en un cartel que
  -- se aprende a saltear.
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

      IF NOT v_confirmada AND coalesce((v_existente->>'stock')::int, 0) > 0 THEN
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
          (v_existente->>'stock')::int,
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

  DELETE FROM public.producto_variantes
   WHERE producto_id = p_producto_id AND negocio_id = p_negocio_id;
  DELETE FROM public.productos_stock
   WHERE producto_id = p_producto_id AND negocio_id = p_negocio_id;

  FOR v_nueva IN SELECT * FROM jsonb_array_elements(p_variantes)
  LOOP
    -- El match por clave normalizada: es lo que hace que corregir el casing
    -- de un atributo siga siendo la MISMA variante y conserve su stock.
    SELECT ve INTO v_existente
      FROM jsonb_array_elements(v_existentes) AS ve
      WHERE (ve->>'clave') = public.atributos_comparables(v_nueva->'atributos')
      LIMIT 1;

    v_stock_input := NULLIF(trim(v_nueva->>'stock_input'), '');
    IF v_stock_input IS NOT NULL THEN
      v_stock := v_stock_input::int;
    ELSE
      v_stock := coalesce((v_existente->>'stock')::int, 0);
    END IF;

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
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_variantes) AS nv
      WHERE public.atributos_comparables(nv->'atributos') = (v_existente->>'clave')
    ) THEN
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
    (a->>'stock_anterior')::int,
    (a->>'stock_nuevo')::int,
    (a->>'precio_anterior')::numeric,
    (a->>'precio_nuevo')::numeric,
    (a->>'costo_anterior')::numeric,
    (a->>'costo_nuevo')::numeric,
    (a->>'editado_por')::uuid
  FROM unnest(v_auditoria) AS a;

  RETURN jsonb_build_object('success', true, 'blocked', false);
END;
$function$;

comment on function public.guardar_variantes_producto(uuid, uuid, jsonb, uuid, jsonb) is
  'Reescribe las variantes de un producto en una transacción. El match entre lo que había y lo que llega es por atributos NORMALIZADOS (atributos_comparables): con igualdad JSONB exacta, corregir el casing de un atributo borraba la variante y le perdía el stock. El freno mira variante por variante, no las cuentas.';
