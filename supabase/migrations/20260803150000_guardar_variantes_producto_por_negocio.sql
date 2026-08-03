-- Multi-tenant: guardar_variantes_producto pasa a recibir p_negocio_id.
--
-- edit-product.ts ya resuelve el negocio activo con negocio_actual() y lo
-- manda como p_negocio_id, pero la función en la base seguía siendo la de
-- 4 argumentos: PostgREST no encontraba la firma y toda edición de producto
-- fallaba con PGRST202 (incluso una que solo tocaba la foto, porque el
-- bloque de variantes corre igual).
--
-- Además de aceptar el parámetro, la función ahora filtra y escribe por
-- negocio explícito: los SELECT/DELETE por producto_id se acotan al negocio
-- y los INSERT llevan negocio_id en vez de depender del DEFAULT
-- security.current_negocio_id(). La RPC es SECURITY INVOKER, así que las
-- policies RESTRICTIVE siguen siendo el freno real; esto es defensa en
-- profundidad, no reemplazo.
--
-- SOLO para bases multi-tenant (hoy: evens-project). En una base sin la
-- columna negocio_id la migración es no-op y deja la función vieja intacta,
-- igual que el resto de las migraciones 20260802*.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'producto_variantes'
      AND column_name = 'negocio_id'
  ) THEN
    RAISE NOTICE 'Base sin multi-tenant: se omite guardar_variantes_producto por negocio.';
    RETURN;
  END IF;

  -- Las firmas viejas se van: dejarlas vivas permitiría guardar variantes
  -- sin negocio explícito desde cualquier cliente desactualizado.
  DROP FUNCTION IF EXISTS public.guardar_variantes_producto(uuid, jsonb, uuid);
  DROP FUNCTION IF EXISTS public.guardar_variantes_producto(uuid, jsonb, uuid, jsonb);

  EXECUTE $fn$
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
  v_existentes_count int;
  v_nuevas_count int;
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

  -- El producto tiene que ser del negocio que dice el llamador. Sin esto,
  -- un producto_id de otro negocio entraría al DELETE de más abajo.
  IF NOT EXISTS (
    SELECT 1 FROM public.productos
    WHERE id = p_producto_id AND negocio_id = p_negocio_id
  ) THEN
    RAISE EXCEPTION 'El producto no pertenece al negocio activo';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', pv.id,
           'atributos', pv.atributos,
           'nombre_display', pv.nombre_display,
           'precio', pv.precio,
           'costo', pv.costo,
           'stock', pv.stock
         )), '[]'::jsonb)
    INTO v_existentes
    FROM public.producto_variantes pv
    WHERE pv.producto_id = p_producto_id
      AND pv.negocio_id = p_negocio_id;

  v_existentes_count := jsonb_array_length(v_existentes);
  v_nuevas_count := jsonb_array_length(p_variantes);

  -- FRENO: si el payload trae menos combinaciones que las que ya existen,
  -- revisamos cada faltante una por una. Las que el cliente confirmó
  -- explícitamente (p_confirmadas_eliminar) se dejan pasar; el resto
  -- bloquea el guardado entero, igual que antes.
  IF v_nuevas_count < v_existentes_count THEN
    FOR v_existente IN SELECT * FROM jsonb_array_elements(v_existentes)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_variantes) AS nv
        WHERE (nv->'atributos') = (v_existente->'atributos')
      ) THEN
        v_confirmada := EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_confirmadas_eliminar) AS ce
          WHERE ce = (v_existente->'atributos')
        );

        IF NOT v_confirmada THEN
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
  END IF;

  DELETE FROM public.producto_variantes
   WHERE producto_id = p_producto_id AND negocio_id = p_negocio_id;
  DELETE FROM public.productos_stock
   WHERE producto_id = p_producto_id AND negocio_id = p_negocio_id;

  FOR v_nueva IN SELECT * FROM jsonb_array_elements(p_variantes)
  LOOP
    SELECT ve INTO v_existente
      FROM jsonb_array_elements(v_existentes) AS ve
      WHERE (ve->'atributos') = (v_nueva->'atributos')
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

  -- Combinaciones que existían y no vinieron en este guardado: se borran
  -- de verdad (ya corrió el DELETE), pero queda registro de qué tenían.
  FOR v_existente IN SELECT * FROM jsonb_array_elements(v_existentes)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_variantes) AS nv
      WHERE (nv->'atributos') = (v_existente->'atributos')
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
    NULLIF(a->>'variante_id_anterior', '')::uuid,
    NULLIF(a->>'variante_id_nueva', '')::uuid,
    a->'atributos',
    a->>'nombre_display',
    a->>'accion',
    (a->>'stock_anterior')::int,
    (a->>'stock_nuevo')::int,
    (a->>'precio_anterior')::numeric,
    (a->>'precio_nuevo')::numeric,
    (a->>'costo_anterior')::numeric,
    (a->>'costo_nuevo')::numeric,
    NULLIF(a->>'editado_por', '')::uuid
  FROM unnest(v_auditoria) AS a;

  RETURN jsonb_build_object('success', true);
END;
$function$;
  $fn$;
END $$;
