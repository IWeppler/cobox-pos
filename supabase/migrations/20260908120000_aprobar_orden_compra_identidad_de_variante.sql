-- ---------------------------------------------------------------------------
-- El ingreso por remito resuelve la variante por IDENTIDAD DE ATRIBUTOS, y dos
-- productos distintos del mismo remito ya no se pueden fusionar en silencio.
--
-- EL INCIDENTE (Evens, medido el 8/9/2026 sobre datos de producción).
--
-- La dueña cargó vestidos de egresada —prendas ÚNICAS, una por color— y el
-- stock le quedó combinado. El camino completo:
--
--   1. `sugerir_productos_similares` puntúa por trigramas con umbral 0.60.
--      Los nombres de esa familia comparten el prefijo "VESTIDO EGRESADA "
--      (17 de ~22 caracteres), así que el nombre propio casi no pesa: medido
--      contra el catálogo real, "VESTIDO EGRESADA ALANA" da 0,77 con ALINA,
--      0,70 con ANAHI, 0,65 con "11" y 0,64 con AMBAR. TODOS pasan el umbral.
--   2. La pantalla ofrece el mejor con un botón "Confirmar asociación", y
--      nada impide mandar varios grupos del remito al MISMO producto. En el
--      remito del 28/8, 24 líneas con 24 nombres de vestido distintos
--      terminaron en 5 productos.
--   3. Acá, esta función buscaba la variante por `nombre_display` con
--      igualdad de TEXTO. "Talle: U / Color: BORDO" de ALANA y de GEORGINA es
--      la misma cadena, así que caían en la misma fila: `stock = stock + 1`
--      dos veces, y la segunda línea además PISABA los atributos de la
--      primera. Dos vestidos únicos distintos quedaron como una variante con
--      stock 2.
--
-- Daño medido sobre remitos ya aprobados: 37 casos en Evens (75 líneas, 98
-- unidades) y 17 en Estilo Bonito (34 líneas, 46 unidades). De los de Evens,
-- 7 son prendas de nombre distinto fusionadas — 3 vestidos de egresada del
-- 28/8 y 4 camisas broderie del 31/7.
--
-- QUÉ CAMBIA ACÁ, y qué NO.
--
-- (1) La variante se resuelve por `atributos_comparables`, que es la misma
--     expresión del índice único `idx_variante_identidad`, y no por el texto
--     del nombre. Es la regla que el resto del sistema ya sigue: la identidad
--     de una variante son sus atributos canonicalizados, no cómo se escribió.
--     De paso arregla el reverso: "Talle: U" y "Talle: Unico" dejan de crear
--     dos variantes para la misma prenda.
--
-- (2) Un guard, ANTES de escribir una sola fila, que rechaza el remito cuando
--     dos líneas con RAW_NOMBRE DISTINTO resuelven a la misma variante del
--     mismo producto. Ese caso no tiene interpretación correcta posible: o la
--     vinculación está mal, o son dos prendas que el archivo no distingue.
--     Sumarlas es inventar un dato. Dos líneas con el MISMO raw_nombre sí se
--     siguen sumando: es el remito que trae la misma prenda en dos renglones.
--
-- (3) El espejo legacy `productos_stock` pasa a buscarse por el nombre REAL
--     de la variante resuelta, no por el texto que trae el remito. Sin esto,
--     una variante que ya existía como "Talle: Unico" y entra como "Talle: U"
--     sumaba bien en `producto_variantes` y abría una fila espejo nueva.
--
-- NO se toca el wrapper `aprobar_orden_compra`, que declara el origen del
-- movimiento de stock. NO se renombra ninguna variante existente: renombrar
-- en masa deja sin vender a los dispositivos con el catálogo cacheado
-- (incidente del 5/9/2026), así que cuando la identidad coincide y el texto
-- no, gana el nombre que ya está guardado.
--
-- El cuerpo de abajo parte del cuerpo VIVO (`pg_get_functiondef`), no de la
-- última migración que lo tocó — que es la lección que dejó
-- `20260904140000`, cuando una reescritura desde una copia vieja se llevó
-- puestas la creación de `unidades_serie` y el guard de atributos.
-- ---------------------------------------------------------------------------

create or replace function public.aprobar_orden_compra_impl(
  p_orden_id uuid,
  p_proveedor text,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_item_id uuid;
  v_raw_nombre text;
  v_estado_match text;
  v_variante text;
  v_atributos jsonb;
  v_sku text;
  v_imei text;
  v_cantidad numeric(12,3);
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;
  v_negocio_id uuid;

  v_variante_id uuid;
  v_nombre_variante text;
  v_identidad text;
  v_stock_id uuid;
  v_estado_actual text;
  v_colisiones text;

  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
  v_imeis_creados integer := 0;
begin
  -- ── GUARD DE FUSIÓN ──────────────────────────────────────────────────────
  --
  -- Va PRIMERO, antes del update de estado y de cualquier escritura: un
  -- remito mal vinculado tiene que rebotar entero, no a la mitad. La
  -- identidad de cada línea se calcula igual que abajo — atributos
  -- canonicalizados, y el nombre visible solo cuando no hay atributos.
  with lineas as (
    select
      nullif(it->>'producto_id', '')::uuid as producto_id,
      lower(trim(coalesce(nullif(it->>'raw_nombre', ''), '(sin nombre)'))) as raw_nombre,
      coalesce(
        nullif(public.atributos_comparables(coalesce(it->'atributos', '{}'::jsonb)), ''),
        'display:' || lower(trim(coalesce(nullif(it->>'variante', ''), 'Unico')))
      ) as identidad
    from jsonb_array_elements(p_items) as it
    where nullif(it->>'producto_id', '') is not null
  ),
  choques as (
    select
      l.producto_id,
      l.identidad,
      string_agg(distinct l.raw_nombre, ' + ' order by l.raw_nombre) as nombres
    from lineas l
    group by l.producto_id, l.identidad
    having count(distinct l.raw_nombre) > 1
  )
  select string_agg(
           coalesce(p.nombre, c.producto_id::text) || ' (' || c.nombres || ')',
           '; '
         )
    into v_colisiones
  from choques c
  left join productos p on p.id = c.producto_id;

  if v_colisiones is not null then
    raise exception
      'REMITO_VARIANTE_COLISION: hay renglones de productos distintos que caen en la misma variante: %',
      v_colisiones
      using errcode = 'P0001';
  end if;

  update ordenes_compra
  set estado = 'APROBADA'
  where id = p_orden_id
    and estado <> 'APROBADA'
  returning negocio_id into v_negocio_id;

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
      'alias_registrados', 0,
      'imeis_creados', 0
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    if v_producto_id is null then
      continue;
    end if;

    v_item_id      := nullif(v_item->>'item_id', '')::uuid;
    v_raw_nombre   := coalesce(v_item->>'raw_nombre', '');
    v_estado_match := v_item->>'estado_match';
    v_variante     := coalesce(nullif(v_item->>'variante', ''), 'Unico');
    v_atributos    := coalesce(v_item->'atributos', '{}'::jsonb);
    v_sku          := nullif(trim(coalesce(v_item->>'sku', '')), '');
    v_imei         := nullif(trim(coalesce(v_item->>'imei', '')), '');
    v_cantidad     := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

    if v_item_id is not null then
      update ordenes_items
      set producto_id = v_producto_id,
          variante_match = v_variante
      where id = v_item_id;
    end if;

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

    -- ── IDENTIDAD DE LA VARIANTE ──────────────────────────────────────────
    --
    -- Misma expresión que el índice único `idx_variante_identidad`, así que
    -- lo que acá se considera "la misma variante" es exactamente lo que la
    -- base va a dejar existir una sola vez. Buscar por `nombre_display` era
    -- lo que fusionaba prendas distintas y, al revés, duplicaba la misma
    -- prenda escrita de dos formas.
    v_identidad := public.atributos_comparables(v_atributos);
    v_variante_id := null;
    v_nombre_variante := null;

    if v_identidad = '' then
      -- Sin atributos no hay identidad que comparar: el nombre visible es lo
      -- único que distingue la fila. (Un payload con `{}` significa "no sé",
      -- no "borralos" — ver 20260818133834.)
      select id, nombre_display into v_variante_id, v_nombre_variante
      from producto_variantes
      where producto_id = v_producto_id
        and nombre_display = v_variante
      limit 1;
    else
      select id, nombre_display into v_variante_id, v_nombre_variante
      from producto_variantes
      where producto_id = v_producto_id
        and public.atributos_comparables(atributos) = v_identidad
      limit 1;

      if v_variante_id is null then
        -- Variantes viejas que nunca recibieron atributos (65 en Evens al
        -- 8/9/2026): se las reconoce por el nombre y el update de abajo les
        -- completa los atributos. Sin este escalón, cada una se duplicaría.
        select id, nombre_display into v_variante_id, v_nombre_variante
        from producto_variantes
        where producto_id = v_producto_id
          and nombre_display = v_variante
          and public.atributos_comparables(atributos) = ''
        limit 1;
      end if;
    end if;

    if v_variante_id is not null then
      update producto_variantes
      set
        stock = stock + v_cantidad,
        atributos = case
          when v_atributos = '{}'::jsonb then producto_variantes.atributos
          else v_atributos
        end,
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
      )
      returning id into v_variante_id;

      v_nombre_variante := v_variante;
      v_variantes_creadas := v_variantes_creadas + 1;
    end if;

    if v_imei is not null and v_variante_id is not null then
      insert into unidades_serie (negocio_id, producto_variante_id, imei, estado)
      values (
        coalesce(v_negocio_id, security.current_negocio_id()),
        v_variante_id,
        v_imei,
        'disponible'
      )
      on conflict (negocio_id, imei) do nothing;

      if found then
        v_imeis_creados := v_imeis_creados + 1;
      end if;
    end if;

    -- El espejo legacy se mueve con el nombre REAL de la variante que se
    -- acaba de tocar, no con el texto del remito: si la variante ya existía
    -- como "Talle: Unico" y el remito dice "Talle: U", el stock sumaba en la
    -- variante correcta y abría una fila espejo aparte.
    v_nombre_variante := coalesce(v_nombre_variante, v_variante);

    select id into v_stock_id
    from productos_stock
    where producto_id = v_producto_id
      and variante = v_nombre_variante
    limit 1;

    if v_stock_id is not null then
      update productos_stock
      set cantidad = cantidad + v_cantidad
      where id = v_stock_id;
    else
      insert into productos_stock (producto_id, variante, cantidad)
      values (v_producto_id, v_nombre_variante, v_cantidad);
    end if;

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
    'alias_registrados', coalesce(array_length(v_alias_registrados, 1), 0),
    'imeis_creados', v_imeis_creados
  );
end;
$function$;

comment on function public.aprobar_orden_compra_impl(uuid, text, jsonb) is
  'Motor de ingreso de mercadería por remito. Resuelve la variante por atributos_comparables (misma expresión que idx_variante_identidad) y rechaza el remito si dos renglones de productos distintos caen en la misma variante. Incluye lo que una reescritura completa puede volver a perder: cantidad decimal, atributos que no se pisan con {} y creación de unidades_serie desde el IMEI.';

-- ---------------------------------------------------------------------------
-- Guards: que la próxima reescritura no pierda ninguna de las cuatro piezas.
-- Mismo criterio que `20260904140000` y que el guard de policies de
-- `20260816100000`: si el cuerpo vivo no las tiene, la migración falla.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'aprobar_orden_compra_impl';

  if v_def is null then
    raise exception 'aprobar_orden_compra_impl no existe';
  end if;

  if position('unidades_serie' in v_def) = 0 then
    raise exception 'aprobar_orden_compra_impl quedó sin la creación de unidades_serie';
  end if;

  if position('producto_variantes.atributos' in v_def) = 0 then
    raise exception 'aprobar_orden_compra_impl quedó pisando atributos con {}';
  end if;

  if position('atributos_comparables' in v_def) = 0 then
    raise exception 'aprobar_orden_compra_impl volvió a resolver la variante por nombre_display';
  end if;

  if position('REMITO_VARIANTE_COLISION' in v_def) = 0 then
    raise exception 'aprobar_orden_compra_impl quedó sin el guard de fusión de productos distintos';
  end if;
end;
$do$;
