-- 1) La FK de variante_id_anterior/variante_id_nueva a producto_variantes
-- rompe el propósito mismo de la tabla: producto_variantes_auditoria existe
-- para registrar variantes que YA NO ESTÁN (borradas por el
-- borrado+reinserción de editarProductoAction). En el flujo normal, para
-- cuando se arma la fila de auditoría el DELETE ya corrió, así que
-- variante_id_anterior apunta a un id que ya no existe en la tabla — el
-- INSERT en producto_variantes_auditoria viola la FK inmediatamente
-- (no es un caso de ON DELETE, es un insert-time violation). La tabla ya
-- guarda todo el dato relevante POR VALOR (atributos, stock, precio,
-- costo) en la propia fila, así que no depende de que el id referenciado
-- siga vivo — el registro histórico debe sobrevivir a la desaparición de
-- lo que referencia.
ALTER TABLE public.producto_variantes_auditoria
  DROP CONSTRAINT producto_variantes_auditoria_variante_id_anterior_fkey;

ALTER TABLE public.producto_variantes_auditoria
  DROP CONSTRAINT producto_variantes_auditoria_variante_id_nueva_fkey;

-- 2) RPC atómico: todo el ciclo de guardado de variantes (chequeo de
-- seguridad + delete + reinsert + relaciones + stock legacy + auditoría)
-- corre en una única transacción de Postgres. Si el chequeo detecta
-- variantes faltantes, la función vuelve sin tocar producto_variantes en
-- absoluto (solo deja la auditoría de bloqueo) — el DELETE nunca se llega
-- a ejecutar. Si algo falla a mitad del borrado+reinserción (constraint,
-- error de red interrumpido, lo que sea), Postgres revierte TODO lo que
-- esta función tocó, no puede quedar a medio aplicar.
CREATE OR REPLACE FUNCTION public.guardar_variantes_producto(
  p_producto_id uuid,
  p_variantes jsonb,
  p_editado_por uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_existentes jsonb;
  v_existentes_count int;
  v_nuevas_count int;
  v_faltantes int;
  v_existente jsonb;
  v_nueva jsonb;
  v_new_id uuid;
  v_stock_input text;
  v_stock int;
  v_relacion jsonb;
  v_auditoria jsonb[] := '{}';
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
  -- no tocamos producto_variantes. Dejamos auditoría de qué faltaba y
  -- volvemos — el DELETE de más abajo nunca se ejecuta.
  IF v_nuevas_count < v_existentes_count THEN
    v_faltantes := v_existentes_count - v_nuevas_count;

    FOR v_existente IN SELECT * FROM jsonb_array_elements(v_existentes)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_variantes) AS nv
        WHERE (nv->'atributos') = (v_existente->'atributos')
      ) THEN
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
    END LOOP;

    RETURN jsonb_build_object('success', false, 'blocked', true, 'faltantes', v_faltantes);
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
