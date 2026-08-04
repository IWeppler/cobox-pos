-- 20260802150300_unicidad_por_negocio.sql movió varios UNIQUE de global a
-- (negocio_id, ...), pero las funciones que hacían INSERT ... ON CONFLICT
-- contra esos índices quedaron apuntando al target viejo. Postgres no lo
-- valida al crear la función: falla recién en runtime con
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Roto en producción: aprobar_orden_compra (diccionario_alias) — la aprobación
-- de remitos se caía entera. seed_catalogo_electro tenía el mismo problema
-- latente (categorias y atributos), solo que no se ejecuta a diario.
--
-- negocio_id no se pasa explícito: la columna tiene DEFAULT
-- security.current_negocio_id() y estas funciones corren como invoker, así que
-- el valor está resuelto antes de que se evalúe el arbiter del ON CONFLICT.

CREATE OR REPLACE FUNCTION public.aprobar_orden_compra(
  p_orden_id uuid,
  p_proveedor text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_raw_nombre text;
  v_estado_match text;
  v_variante text;
  v_atributos jsonb;
  v_sku text;
  v_cantidad integer;
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;

  v_variante_id uuid;
  v_stock_id uuid;
  v_estado_actual text;

  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
begin
  -- GUARD DE IDEMPOTENCIA. Antes del loop: si esta orden ya estaba
  -- aprobada, se sale sin haber tocado stock ni precios ni alias.
  update ordenes_compra
  set estado = 'APROBADA'
  where id = p_orden_id
    and estado <> 'APROBADA';

  if not found then
    select estado into v_estado_actual
    from ordenes_compra
    where id = p_orden_id;

    if v_estado_actual is null then
      raise exception 'Orden % no encontrada o sin permiso para aprobarla', p_orden_id;
    end if;

    return jsonb_build_object(
      'ya_aprobada', true,
      'lineas_impactadas', 0,
      'productos_actualizados', 0,
      'variantes_creadas', 0,
      'alias_registrados', 0
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    if v_producto_id is null then
      continue;
    end if;

    v_raw_nombre   := coalesce(v_item->>'raw_nombre', '');
    v_estado_match := v_item->>'estado_match';
    v_variante     := coalesce(nullif(v_item->>'variante', ''), 'Unico');
    v_atributos    := coalesce(v_item->'atributos', '{}'::jsonb);
    v_sku          := nullif(trim(coalesce(v_item->>'sku', '')), '');
    v_cantidad     := coalesce((v_item->>'cantidad')::integer, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

    if not (v_producto_id = any (v_productos_actualizados)) then
      if coalesce(v_precio_costo, 0) <> 0 or coalesce(v_precio_venta, 0) <> 0 then
        update productos
        set
          precio_costo = case
            when coalesce(v_precio_costo, 0) <> 0 then v_precio_costo
            else precio_costo
          end,
          precio = case
            when coalesce(v_precio_venta, 0) <> 0 then v_precio_venta
            else precio
          end
        where id = v_producto_id;
      end if;

      v_productos_actualizados := v_productos_actualizados || v_producto_id;
      v_precio_base_por_producto := v_precio_base_por_producto
        || jsonb_build_object(v_producto_id::text, coalesce(v_precio_venta, 0));
    end if;

    v_precio_base := coalesce(
      (v_precio_base_por_producto->>v_producto_id::text)::numeric,
      0
    );

    select id into v_variante_id
    from producto_variantes
    where producto_id = v_producto_id
      and nombre_display = v_variante
    limit 1;

    if v_variante_id is not null then
      update producto_variantes
      set
        stock = stock + v_cantidad,
        atributos = v_atributos,
        sku = coalesce(v_sku, sku),
        updated_at = now()
      where id = v_variante_id;
    else
      v_difiere_precio := coalesce(v_precio_venta, 0) is distinct from v_precio_base;

      insert into producto_variantes (
        producto_id, nombre_display, atributos, sku, precio, costo, stock
      )
      values (
        v_producto_id,
        v_variante,
        v_atributos,
        v_sku,
        case when v_difiere_precio then v_precio_venta else null end,
        case when v_difiere_precio then v_precio_costo else null end,
        v_cantidad
      );

      v_variantes_creadas := v_variantes_creadas + 1;
    end if;

    -- Espejo legacy productos_stock: se mantiene sincronizado, y su texto
    -- de variante NUNCA se normaliza.
    select id into v_stock_id
    from productos_stock
    where producto_id = v_producto_id
      and variante = v_variante
    limit 1;

    if v_stock_id is not null then
      update productos_stock
      set cantidad = cantidad + v_cantidad
      where id = v_stock_id;
    else
      insert into productos_stock (producto_id, variante, cantidad)
      values (v_producto_id, v_variante, v_cantidad);
    end if;

    -- 3. Diccionario de alias: una sola vez por nombre crudo.
    if v_estado_match in ('DESCONOCIDO', 'NUEVO_ALIAS') then
      v_alias_key := lower(trim(v_raw_nombre));
      if not (v_alias_key = any (v_alias_registrados)) then
        insert into diccionario_alias (proveedor, raw_nombre, producto_id)
        values (p_proveedor, v_alias_key, v_producto_id)
        on conflict (negocio_id, proveedor, raw_nombre)
        do update set producto_id = excluded.producto_id;

        v_alias_registrados := v_alias_registrados || v_alias_key;
      end if;
    end if;

    v_lineas := v_lineas + 1;
  end loop;

  return jsonb_build_object(
    'ya_aprobada', false,
    'lineas_impactadas', v_lineas,
    'productos_actualizados', coalesce(array_length(v_productos_actualizados, 1), 0),
    'variantes_creadas', v_variantes_creadas,
    'alias_registrados', coalesce(array_length(v_alias_registrados, 1), 0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.seed_catalogo_electro()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_cat record;
  v_atributos text[];
  v_atributo text;
  v_cat_id uuid;
  v_atr_id uuid;
  v_orden int;
  v_links int := 0;
BEGIN
  -- 1. Las 4 categorías raíz de electro
  INSERT INTO public.categorias (nombre, slug, orden, activa)
  VALUES
    ('Celulares',            'celulares',            10, true),
    ('Tablets',              'tablets',              20, true),
    ('Televisores',          'televisores',          30, true),
    ('Aires Acondicionados', 'aires-acondicionados', 40, true)
  ON CONFLICT (negocio_id, slug) WHERE parent_id IS NULL DO NOTHING;

  -- 2. Los atributos. `Color` puede existir ya si el proyecto tuvo
  --    indumentaria antes; el ON CONFLICT lo reusa en vez de duplicarlo.
  INSERT INTO public.atributos (nombre, slug, tipo, orden, activo)
  VALUES
    ('Almacenamiento', 'almacenamiento', 'TEXT', 10, true),
    ('RAM',            'ram',            'TEXT', 20, true),
    ('Color',          'color',          'TEXT', 30, true),
    ('Pulgadas',       'pulgadas',       'TEXT', 40, true),
    ('Resolución',     'resolucion',     'TEXT', 50, true),
    ('Frigorías',      'frigorias',      'TEXT', 60, true),
    ('Tipo',           'tipo',           'TEXT', 70, true)
  ON CONFLICT (negocio_id, slug) DO NOTHING;

  -- 3. Qué atributos aplican a cada categoría
  FOR v_cat IN
    SELECT * FROM (VALUES
      ('celulares',            ARRAY['almacenamiento','ram','color']),
      ('tablets',              ARRAY['almacenamiento','ram','color']),
      ('televisores',          ARRAY['pulgadas','resolucion']),
      ('aires-acondicionados', ARRAY['frigorias','tipo'])
    ) AS t(cat_slug, atributos)
  LOOP
    SELECT id INTO v_cat_id
    FROM public.categorias
    WHERE slug = v_cat.cat_slug AND parent_id IS NULL;

    CONTINUE WHEN v_cat_id IS NULL;

    v_atributos := v_cat.atributos;
    v_orden := 0;

    FOREACH v_atributo IN ARRAY v_atributos LOOP
      v_orden := v_orden + 10;

      SELECT id INTO v_atr_id FROM public.atributos WHERE slug = v_atributo;
      CONTINUE WHEN v_atr_id IS NULL;

      INSERT INTO public.categoria_atributos
        (categoria_id, atributo_id, requerido, orden)
      VALUES (v_cat_id, v_atr_id, false, v_orden)
      ON CONFLICT (categoria_id, atributo_id) DO NOTHING;

      v_links := v_links + 1;
    END LOOP;
  END LOOP;

  RETURN format('Seed electro OK: %s vínculos categoría-atributo procesados.', v_links);
END;
$function$;
