-- El freno de guardar_variantes_producto bloqueaba CUALQUIER guardado que
-- trajera menos variantes que las existentes, siempre, sin excepción —
-- incluso cuando el usuario ya había revisado y confirmado esa eliminación
-- puntual en el modal del cliente (ConfirmSaveVariantsModal). En la
-- práctica esto hacía imposible dar de baja una sola variante (un talle
-- descontinuado, un color que ya no se consigue) a través del flujo normal.
--
-- Este cambio agrega p_confirmadas_eliminar: la lista de `atributos` que el
-- modal ya mostró y el usuario tildó como "entiendo que se van a eliminar".
-- El freno solo deja pasar una combinación faltante si está en esa lista —
-- cualquier otra faltante que el usuario NUNCA vio (estado stale, bug,
-- carrera entre pestañas: el caso real que causó la pérdida de stock de
-- CAMISETA ARGENTINA) sigue bloqueando el guardado exactamente como antes.
CREATE OR REPLACE FUNCTION public.guardar_variantes_producto(
  p_producto_id uuid,
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
    WHERE pv.producto_id = p_producto_id;

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
            producto_id, variante_id_anterior, variante_id_nueva, atributos,
            nombre_display, accion, stock_anterior, stock_nuevo,
            precio_anterior, precio_nuevo, costo_anterior, costo_nuevo,
            editado_por
          ) VALUES (
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

  DELETE FROM public.producto_variantes WHERE producto_id = p_producto_id;
  DELETE FROM public.productos_stock WHERE producto_id = p_producto_id;

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
      producto_id, nombre_display, atributos, precio, costo, stock, sku
    ) VALUES (
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
      INSERT INTO public.producto_variante_valores (variante_id, atributo_id, atributo_valor_id)
      VALUES (
        v_new_id,
        (v_relacion->>'atributo_id')::uuid,
        (v_relacion->>'atributo_valor_id')::uuid
      );
    END LOOP;

    INSERT INTO public.productos_stock (producto_id, variante, cantidad)
    VALUES (p_producto_id, v_nueva->>'nombre_display', v_stock);

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
    producto_id, variante_id_anterior, variante_id_nueva, atributos,
    nombre_display, accion, stock_anterior, stock_nuevo,
    precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, editado_por
  )
  SELECT
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
