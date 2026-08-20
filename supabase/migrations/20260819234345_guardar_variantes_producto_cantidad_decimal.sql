-- ---------------------------------------------------------------------------
-- HOTFIX: `guardar_variantes_producto` rompía la edición de productos.
--
-- Síntoma en producción (19/8, Evens): editar cualquier producto con variantes
-- devolvía `22P02 invalid input syntax for type integer: "7.000"`.
--
-- CAUSA: después de pasar `producto_variantes.stock` a numeric(12,3)
-- (20260819175959), el jsonb que arma esta función lleva `'stock', pv.stock`
-- con el valor numeric. `->>'stock'` lo extrae como TEXTO '7.000', y
-- `'7.000'::int` es un error de Postgres, no un redondeo. La función tenía SIETE
-- de esos casteos.
--
-- POR QUÉ NO SE DETECTÓ ANTES: el relevamiento de la Fase 1 buscó los casteos
-- con el patrón `\m(integer|int4|::int)\M`. `\m` exige comienzo de palabra y
-- `:` no lo es, así que la alternativa `::int` NUNCA matcheó y esta función
-- quedó fuera del listado. El relevamiento se rehízo con
-- `(::int\M|::integer\M|\yint\M|\yinteger\M|int4)`, que sí la encuentra, y con
-- ese patrón aparecieron también `registrar_venta` (arreglada en
-- 20260819234607) e `importar_productos_planilla` (código muerto sin punto de
-- entrada, ver CLAUDE.md).
--
-- Se arregla junto la tabla de auditoría: sus columnas de stock seguían en
-- integer, así que aunque los casteos se arreglaran, el INSERT final habría
-- fallado igual.
-- ---------------------------------------------------------------------------

alter table public.producto_variantes_auditoria
  alter column stock_anterior type numeric(12,3) using stock_anterior::numeric(12,3),
  alter column stock_nuevo   type numeric(12,3) using stock_nuevo::numeric(12,3);

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
  -- borra sin que nadie lo haya pedido. Solo bloquean las que TIENEN stock:
  -- una variante agotada que desaparece no destruye nada, y frenar por eso
  -- convertiría el freno en un cartel que se aprende a saltear.
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
      -- La coma se acepta como decimal: el input del formulario la deja
      -- tipear y '7,5'::numeric sería otro 22P02 con la dueña adelante.
      v_stock := replace(v_stock_input, ',', '.')::numeric;
    ELSE
      v_stock := coalesce((v_existente->>'stock')::numeric, 0);
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

do $$
declare v_int_restantes int;
begin
  select count(*) into v_int_restantes
  from (
    select l from regexp_split_to_table(
      pg_get_functiondef('public.guardar_variantes_producto(uuid,uuid,jsonb,uuid,jsonb)'::regprocedure),
      E'\n') as l
    where l ~* '(::int\M|::integer\M)' and l ~* 'stock'
  ) x;

  if v_int_restantes > 0 then
    raise exception 'Quedaron % casteos de stock a integer en guardar_variantes_producto', v_int_restantes;
  end if;
end;
$$;
