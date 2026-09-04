-- ---------------------------------------------------------------------------
-- Conciliación de remitos, modo CARGA INICIAL.
--
-- POR QUÉ. La pantalla de conciliación asume que la mayoría de las filas de un
-- remito ya existen en el catálogo. Medido sobre los 142 remitos reales de los
-- 4 negocios, eso es falso incluso en el comercio establecido: Evens matchea
-- el 17,9% de los grupos y Estilo Bonito el 27,8%. Peor, 117 de esos 142
-- remitos matchean MENOS del 20%, y solo 3 caen entre 20% y 40% — la
-- distribución es bimodal y el valle está vacío.
--
-- Esta migración pone las dos piezas de base que el modo carga inicial
-- necesita y que hoy no existen:
--
--   1. `ordenes_borradores`: el progreso de una conciliación a medio hacer.
--      Hoy vive SOLO en IndexedDB del navegador (merge-draft-db.ts), así que
--      cambiar de máquina, limpiar el sitio o abrir desde el celular pierde
--      todo el trabajo. Con 62 grupos promedio por remito en Estilo Bonito,
--      eso es media hora de tipeo. Además explica el 22% de remitos de Evens
--      que quedaron en PENDIENTE para siempre.
--
--   2. `crear_productos_desde_remito`: la creación EN LOTE de los productos
--      nuevos, idempotente. Hoy se crean de a uno con
--      `crearProductoAlVueloAction`, que no tiene ningún guard: confirmar dos
--      veces (doble click, reintento después de un timeout, pestaña vieja)
--      crea el producto dos veces. La clave de idempotencia no es un hash
--      inventado sino un dato que ya teníamos que escribir igual:
--      `ordenes_items.producto_id`. Si la línea ya apunta a un producto, esa
--      línea ya se creó.
--
-- El STOCK no entra acá a propósito: lo sigue impactando
-- `aprobar_orden_compra`, que ya es idempotente por su propio guard
-- (`update ... where estado <> 'APROBADA'` + `if not found`). Dos guards
-- distintos para dos escrituras distintas es más simple que uno que abarque
-- las dos y tenga que decidir qué hacer cuando una está hecha y la otra no.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. El borrador
-- ---------------------------------------------------------------------------

create table if not exists public.ordenes_borradores (
  orden_id      uuid primary key
                references public.ordenes_compra(id) on delete cascade,
  negocio_id    uuid not null default security.current_negocio_id(),
  -- El estado completo de la pantalla: filas editadas, modo elegido, recargo.
  -- Va como jsonb y no como columnas porque es un BORRADOR: su forma cambia
  -- cada vez que cambia la pantalla, y una migración por cada campo nuevo de
  -- una pantalla que todavía se está diseñando es peor que un blob opaco que
  -- nadie más lee. Lo definitivo se escribe en productos/ordenes_items.
  payload       jsonb not null,
  actualizado_en timestamptz not null default now()
);

comment on table public.ordenes_borradores is
  'Progreso sin confirmar de una conciliación de remito. Una fila por orden. Reemplaza al borrador en IndexedDB, que se perdía al cambiar de máquina o limpiar el navegador. Se borra sola cuando la orden se borra (FK on delete cascade) y la borra la app al aprobar.';
comment on column public.ordenes_borradores.payload is
  'Estado de la pantalla, opaco para la base. Nada del sistema lee adentro: lo definitivo vive en productos y ordenes_items.';

alter table public.ordenes_borradores enable row level security;

-- Aislamiento con la forma que usa el índice: `negocio_id = (select ...)`,
-- nunca `same_negocio(negocio_id)` (ver 20260816100000).
create policy aislamiento_negocio on public.ordenes_borradores
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

-- Un borrador no es más sensible que la orden que describe, y esa ya la lee
-- y la escribe cualquier usuario del negocio que no sea vendedor (el corte de
-- rol lo hace la pantalla, con bloquearVendedor).
create policy ordenes_borradores_select on public.ordenes_borradores
  for select to authenticated using (true);
create policy ordenes_borradores_insert on public.ordenes_borradores
  for insert to authenticated with check (true);
create policy ordenes_borradores_update on public.ordenes_borradores
  for update to authenticated using (true) with check (true);
create policy ordenes_borradores_delete on public.ordenes_borradores
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Creación en lote de los productos nuevos de un remito
--
-- SECURITY INVOKER (el default): el aislamiento entre negocios tiene que
-- seguir siendo la RLS del que llama, igual que en `registrar_venta`.
--
-- La canonicalización de atributos NO pasa por acá: las variantes las sigue
-- creando `aprobar_orden_compra` con el cache de atributos que arma Node
-- (construirCacheAtributos). Esta función crea la CABECERA del producto y
-- nada más.
-- ---------------------------------------------------------------------------

create or replace function public.crear_productos_desde_remito(
  p_orden_id uuid,
  p_items    jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_item          jsonb;
  v_item_ids      uuid[];
  v_producto_id   uuid;
  v_categoria_id  uuid;
  v_categoria_nom text;
  v_nombre        text;
  v_slug          text;
  v_tipo          text;
  v_precio        numeric;
  v_costo         numeric;
  v_marca         text;
  v_creados       integer := 0;
  v_reusados      integer := 0;
  v_mapa          jsonb := '{}'::jsonb;
begin
  -- Lock de la orden: serializa dos confirmaciones simultáneas de la MISMA
  -- conciliación. Sin esto las dos leerían `producto_id is null` y las dos
  -- crearían el producto — el mismo patrón de "select y después escribo" que
  -- ya costó stock ×8 en Estilo Bonito.
  perform 1 from ordenes_compra where id = p_orden_id for update;
  if not found then
    raise exception 'Orden % no encontrada o sin permiso', p_orden_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select array_agg(x::uuid)
      into v_item_ids
      from jsonb_array_elements_text(coalesce(v_item->'item_ids', '[]'::jsonb)) x;

    if v_item_ids is null or array_length(v_item_ids, 1) is null then
      continue;
    end if;

    -- IDEMPOTENCIA: si alguna línea de este grupo ya apunta a un producto,
    -- este grupo ya se creó. Se reusa y no se inserta nada.
    select producto_id
      into v_producto_id
      from ordenes_items
     where id = any(v_item_ids)
       and producto_id is not null
     limit 1;

    if v_producto_id is not null then
      v_reusados := v_reusados + 1;
    else
      v_nombre := nullif(trim(coalesce(v_item->>'nombre', '')), '');
      if v_nombre is null then
        raise exception 'Hay una fila sin nombre de producto';
      end if;

      v_categoria_id  := nullif(v_item->>'categoria_id', '')::uuid;
      v_categoria_nom := nullif(trim(coalesce(v_item->>'categoria_nombre_nueva', '')), '');
      v_precio        := coalesce(nullif(v_item->>'precio', '')::numeric, 0);
      v_costo         := coalesce(nullif(v_item->>'costo', '')::numeric, 0);
      v_marca         := nullif(trim(coalesce(v_item->>'marca', '')), '');

      -- Categoría que el comercio todavía no tiene. Pasa justo en el caso que
      -- motiva este modo: catálogo vacío. Se crea como RAÍZ y solo si la fila
      -- trae un nombre explícito — la pantalla nunca manda un nombre que la
      -- persona no vio y pudo cambiar.
      if v_categoria_id is null and v_categoria_nom is not null then
        insert into categorias (nombre, slug, parent_id, activa)
        values (
          v_categoria_nom,
          regexp_replace(
            lower(public.unaccent_immutable(v_categoria_nom)),
            '[^a-z0-9]+', '-', 'g'
          ),
          null,
          true
        )
        on conflict (negocio_id, slug) where parent_id is null do nothing
        returning id into v_categoria_id;

        -- El `do nothing` no devuelve fila cuando la categoría ya existía.
        if v_categoria_id is null then
          select id into v_categoria_id
            from categorias
           where parent_id is null
             and slug = regexp_replace(
                   lower(public.unaccent_immutable(v_categoria_nom)),
                   '[^a-z0-9]+', '-', 'g'
                 )
           limit 1;
        end if;
      end if;

      select nombre into v_tipo from categorias where id = v_categoria_id;
      v_tipo := coalesce(v_tipo, 'General');

      v_slug := regexp_replace(
                  lower(public.unaccent_immutable(v_nombre)),
                  '[^a-z0-9]+', '-', 'g'
                ) || '-' || substr(md5(random()::text), 1, 4);

      insert into productos (
        nombre, slug, tipo, categoria_id, marca,
        precio, precio_costo, publicado, atributos_globales
      )
      values (
        v_nombre, v_slug, v_tipo, v_categoria_id, v_marca,
        v_precio, v_costo, true, '{}'::jsonb
      )
      returning id into v_producto_id;

      v_creados := v_creados + 1;
    end if;

    -- La línea queda apuntando al producto ANTES de que se impacte el stock.
    -- Es lo que hace idempotente al reintento y, de paso, lo que hace que un
    -- remito abandonado a mitad de camino se pueda retomar sabiendo qué se
    -- había creado.
    update ordenes_items
       set producto_id  = v_producto_id,
           estado_match = case
             when estado_match = 'DESCONOCIDO' then 'NUEVO_ALIAS'
             else estado_match
           end,
           precio_costo = case
             when nullif(v_item->>'costo', '') is not null
               then (v_item->>'costo')::numeric
             else precio_costo
           end
     where id = any(v_item_ids);

    v_mapa := v_mapa || jsonb_build_object(
      coalesce(v_item->>'raw_nombre', ''), v_producto_id
    );
  end loop;

  return jsonb_build_object(
    'creados', v_creados,
    'reusados', v_reusados,
    'productos_por_raw_nombre', v_mapa
  );
end;
$$;

comment on function public.crear_productos_desde_remito(uuid, jsonb) is
  'Crea en lote las cabeceras de producto de un remito en modo carga inicial. Idempotente: si la línea ya tiene producto_id, lo reusa. No toca stock — eso sigue siendo aprobar_orden_compra.';

revoke all on function public.crear_productos_desde_remito(uuid, jsonb) from public;
grant execute on function public.crear_productos_desde_remito(uuid, jsonb) to authenticated;
