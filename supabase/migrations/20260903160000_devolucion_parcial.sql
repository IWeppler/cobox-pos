-- Devolución parcial de una venta: renglones sueltos, con su plata y su
-- destino de mercadería.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE HACÍA FALTA Y NO ESTABA
--
-- Hasta acá devolver algo era anular la venta entera. Con el 56,1% de los
-- tickets de Evens de un solo renglón eso alcanza para la mitad de los casos;
-- para la otra mitad, devolver una prenda de tres obligaba a tirar el ticket
-- completo y volver a cargar las dos que se quedaban.
--
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ SE PUEDE DEVOLVER, Y POR QUÉ TAN POCO
--
-- SOLO ventas cobradas con UN método y que sea EFECTIVO o TRANSFERENCIA. Es el
-- 75,4% de las ventas de Evens en 30 días. Lo que queda afuera, afuera queda
-- por un motivo distinto cada uno:
--
--   * CUENTA CORRIENTE (20,6%): los pagos de CC no están imputados a una
--     venta, así que ante una devolución parcial de un fiado a medio pagar no
--     hay forma de saber si lo devuelto ya estaba pagado o sigue debiéndose.
--     Es un cambio de esquema (imputación), no una consulta.
--   * TARJETA (2,8%): devolver por posnet es una operación del posnet, y el
--     recargo cobrado no se recupera. Necesita decidir política antes que
--     código.
--   * MIXTO (1,3%): "de cuál de los dos sale" no lo puede adivinar la función.
--     Con seis casos por mes, la respuesta razonable es preguntar, no repartir.
--
-- Los tres se rechazan con un código propio para que la app explique cuál es y
-- ofrezca anular, que es lo que se hace hoy.
--
-- ───────────────────────────────────────────────────────────────────────────
-- EL ESTADO DE LA VENTA NO SE TOCA. Es la decisión más importante del archivo.
--
-- Lo natural sería agregar 'DEVUELTA_PARCIAL' a `estado_operacion`. No se
-- hace, y no es prudencia genérica: hay DOCE consumidores que deciden qué
-- contar con `estado_operacion <> 'ANULADA'` — el panel, /reportes,
-- get-dashboard-metrics, el arqueo de caja, el reporte de vendedores, las
-- exportaciones al contador, `resumen_gerencial_caja`,
-- `totales_ventas_por_turno`, `caja_por_negocio`, `comercios_con_uso` y dos
-- del panel de super admin. Un estado nuevo pasa ese filtro y la venta se
-- cuenta ENTERA, devolución incluida, en todos ellos a la vez.
--
-- En su lugar la venta queda CONFIRMADA y lo devuelto se acumula en
-- `ventas.monto_devuelto`. Los doce siguen funcionando exactamente igual, y
-- restarle lo devuelto a cada uno es un cambio aditivo que se puede hacer de a
-- uno y verificar de a uno. Mientras tanto sobreestiman el ingreso en lo
-- devuelto, que es un error acotado, medible y del mismo signo que el de hoy —
-- no doce filtros rotos a la vez.
--
-- Una venta devuelta al 100% por esta vía queda con `monto_devuelto = total`.
-- No se convierte en ANULADA: anular mueve la plata por otro camino y tiene su
-- propia auditoría. Son dos operaciones distintas que terminan en el mismo
-- número, y mezclarlas haría que la anulación tenga dos implementaciones.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cuánto se devolvió de cada renglón
--
-- Esta columna NO es una comodidad de lectura: es contra qué se valida que no
-- se devuelva más de lo vendido, y tiene que poder chequearse DENTRO del
-- UPDATE (`where cantidad_devuelta + n <= cantidad`). Con un SELECT previo,
-- dos devoluciones simultáneas del mismo renglón leen "0 devueltas" y escriben
-- las dos: cuatro unidades devueltas de dos vendidas, con la plata saliendo
-- dos veces. Es el mismo patrón que en julio costó 1.960 unidades de stock en
-- Estilo Bonito.
--
-- El CHECK es la segunda red: aunque alguien escriba por otro camino, la base
-- no acepta una cantidad devuelta mayor que la vendida.
-- ---------------------------------------------------------------------------
alter table public.ventas_items
  add column if not exists cantidad_devuelta numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventas_items'::regclass
       and conname = 'ventas_items_cantidad_devuelta_check'
  ) then
    alter table public.ventas_items
      add constraint ventas_items_cantidad_devuelta_check
      check (cantidad_devuelta >= 0 and cantidad_devuelta <= cantidad);
  end if;
end $$;

comment on column public.ventas_items.cantidad_devuelta is
  'Unidades ya devueltas de este renglon. Se valida dentro del UPDATE de registrar_devolucion: es el guard de concurrencia, no un cache.';

alter table public.ventas
  add column if not exists monto_devuelto numeric not null default 0;

comment on column public.ventas.monto_devuelto is
  'Cuanto de esta venta se devolvio, con el recargo prorrateado incluido. La venta sigue CONFIRMADA: el ingreso neto es total - monto_devuelto. Ver 20260903160000.';

-- ---------------------------------------------------------------------------
-- 2. La devolución como entidad
--
-- Inmutable por RLS —SELECT e INSERT, sin UPDATE ni DELETE— igual que
-- `comprobantes`, `movimientos_stock` y `ventas_correcciones`. Una devolución
-- que se puede editar después no sirve para explicar una caja.
--
-- Los montos van CONGELADOS en la fila y no se recalculan por join: si mañana
-- cambia el precio del producto o se borra la variante, lo devuelto tiene que
-- seguir diciendo lo que se devolvió.
-- ---------------------------------------------------------------------------
create table if not exists public.devoluciones (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        uuid not null default security.current_negocio_id(),
  venta_id          uuid not null references public.ventas(id) on delete restrict,
  -- Base devuelta: mercadería, sin recargo. Es Σ(precio_final × cantidad).
  base_devuelta     numeric not null,
  -- La parte del recargo del ticket que le toca a lo devuelto.
  recargo_devuelto  numeric not null default 0,
  -- base + recargo: lo que se le devuelve al cliente.
  monto_devuelto    numeric not null,
  -- Con qué se había cobrado, congelado. EFECTIVO sale de la caja; el resto
  -- vuelve por donde entró y la caja no lo toca.
  metodo_tipo       text not null,
  metodo_nombre     text,
  -- Solo cuando el método era EFECTIVO.
  turno_caja_id     uuid,
  motivo_codigo     text,
  motivo_detalle    text,
  creado_por        uuid,
  creado_en         timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.devoluciones'::regclass
       and conname = 'devoluciones_motivo_codigo_check'
  ) then
    -- La MISMA lista que la anulación (20260903140000) y que
    -- features/sales/lib/motivo-anulacion.ts. Devolver y anular se preguntan
    -- lo mismo, y si las listas divergen no se pueden sumar.
    alter table public.devoluciones
      add constraint devoluciones_motivo_codigo_check
      check (motivo_codigo is null
             or motivo_codigo in ('ERROR_DE_CARGA', 'CAMBIO', 'ARREPENTIMIENTO',
                                  'FALLADO', 'OTRO'));
  end if;
end $$;

create table if not exists public.devoluciones_items (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     uuid not null default security.current_negocio_id(),
  devolucion_id  uuid not null references public.devoluciones(id) on delete cascade,
  -- Sin FK a ventas_items a propósito: el renglón de una venta vieja puede
  -- desaparecer en una limpieza y la devolución tiene que sobrevivir, igual
  -- que `ventas_items.variante_id` sobrevive al borrado de la variante.
  venta_item_id  uuid not null,
  variante_id    uuid,
  cantidad       numeric not null check (cantidad > 0),
  -- Congelado: precio unitario ya con el descuento del renglón restado.
  precio_final   numeric not null,
  -- POR RENGLÓN, no por devolución: una devolución de dos prendas donde una
  -- vuelve sana y la otra rota es un caso normal, y hasta ahora no se podía
  -- expresar — anular elegía un destino para el ticket entero.
  destino        text not null check (destino in ('STOCK', 'BAJA'))
);

create index if not exists idx_devoluciones_venta
  on public.devoluciones (negocio_id, venta_id, creado_en);

create index if not exists idx_devoluciones_items_devolucion
  on public.devoluciones_items (devolucion_id);

alter table public.devoluciones enable row level security;
alter table public.devoluciones_items enable row level security;

-- `negocio_id = (select ...)`, nunca `same_negocio(negocio_id)`: la segunda
-- forma corre por fila y no usa el índice (ver 20260816100000).
create policy aislamiento_negocio on public.devoluciones
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

create policy devoluciones_select on public.devoluciones
  for select to authenticated using (true);

create policy devoluciones_insert on public.devoluciones
  for insert to authenticated with check (true);

create policy aislamiento_negocio on public.devoluciones_items
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

create policy devoluciones_items_select on public.devoluciones_items
  for select to authenticated using (true);

create policy devoluciones_items_insert on public.devoluciones_items
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- 3. El permiso, separado del de anular
--
-- Es el punto 3 del plan. Devolver un renglón con el ticket adelante es la
-- operación del mostrador; anular una venta entera es otra cosa. En Evens
-- `ventas.anular` lo tienen ADMIN y ENCARGADO, y como no hay nadie con rol
-- ENCARGADO, hoy cualquier devolución necesita a la dueña.
--
-- Va acá y no en una migración propia porque un permiso otorgado a las
-- vendedoras de siete comercios que no habilita nada no se puede probar: acá
-- nace junto con lo que habilita.
-- ---------------------------------------------------------------------------
insert into public.permisos (clave, modulo, descripcion)
values (
  'ventas.devolver',
  'ventas',
  'Registrar la devolucion de renglones de una venta propia'
)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol_id, permiso_id, negocio_id)
select r.id, p.id, r.negocio_id
from public.roles r
cross join public.permisos p
where p.clave = 'ventas.devolver'
  and r.nombre in ('ADMIN', 'ENCARGADO', 'VENDEDOR')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. El origen del movimiento de stock
--
-- Sin esto el trigger de `movimientos_stock` guardaría 'DESCONOCIDO', que
-- arruina justo la cuenta de quiebres que motiva esa tabla.
-- ---------------------------------------------------------------------------
alter table public.movimientos_stock
  drop constraint if exists movimientos_stock_origen_check;

alter table public.movimientos_stock
  add constraint movimientos_stock_origen_check
  check (origen = any (array[
    'VENTA', 'ANULACION_VENTA', 'DEVOLUCION_PARCIAL', 'REVERSO_VENTA',
    'REMITO', 'CARGA_RAPIDA', 'IMPORTACION', 'EDICION_VARIANTES',
    'BAJA', 'FOTO_INICIAL', 'DESCONOCIDO'
  ]));

-- ---------------------------------------------------------------------------
-- 5. La función
--
-- SECURITY DEFINER por el mismo motivo que `corregir_metodo_pago_venta`: la
-- policy de UPDATE sobre `ventas` exige `ventas.anular`, que es justo el
-- permiso que esta operación NO necesita. Los chequeos que haría la RLS van
-- escritos explícitos y primero.
--
-- El stock y las unidades serializadas quedan AFUERA, igual que en
-- `anular_venta` y `registrar_venta`: son compensaciones con su propia
-- atomicidad, y para cuando corren la plata ya se movió. Que puedan voltear la
-- devolución dejaría a la vendedora reintentando sobre algo ya hecho.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_devolucion(
  p_venta_id uuid,
  p_lineas jsonb,
  p_motivo_codigo text default null,
  p_motivo_detalle text default null,
  p_turno_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_negocio        uuid := security.current_negocio_id();
  v_usuario        uuid := auth.uid();
  v_venta          public.ventas%rowtype;
  v_pago           public.venta_pagos%rowtype;
  v_cobros         int;
  v_linea          jsonb;
  v_item           public.ventas_items%rowtype;
  v_cantidad       numeric;
  v_destino        text;
  v_base           numeric := 0;
  v_base_total     numeric;
  v_recargo_total  numeric;
  v_recargo_previo numeric;
  v_base_previa    numeric;
  v_recargo        numeric;
  v_monto          numeric;
  v_devolucion_id  uuid;
  v_items          jsonb := '[]'::jsonb;
  v_ticket         text := upper(split_part(p_venta_id::text, '-', 1));
  v_todo_devuelto  boolean;
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  if not public.tiene_permiso('ventas.devolver') then
    raise exception 'SIN_PERMISO';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'SIN_RENGLONES';
  end if;

  -- `for update`: el lock de la venta serializa dos devoluciones simultáneas
  -- antes de que ninguna toque un renglón.
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or v_venta.negocio_id is distinct from v_negocio then
    raise exception 'VENTA_INEXISTENTE';
  end if;

  if v_venta.vendedor_id is distinct from v_usuario
     and not public.tiene_permiso('ventas.ver_todas') then
    raise exception 'VENTA_AJENA';
  end if;

  if v_venta.estado_operacion <> 'CONFIRMADA' then
    raise exception 'VENTA_NO_DEVOLVIBLE';
  end if;

  if coalesce(v_venta.monto_pendiente, 0) > 0 then
    raise exception 'VENTA_CON_CUENTA_CORRIENTE';
  end if;

  select count(*) into v_cobros
    from public.venta_pagos
   where venta_id = p_venta_id and tipo_movimiento = 'PAGO_VENTA';

  if v_cobros <> 1 then
    raise exception 'VENTA_CON_PAGO_MIXTO';
  end if;

  select * into v_pago
    from public.venta_pagos
   where venta_id = p_venta_id and tipo_movimiento = 'PAGO_VENTA';

  if v_pago.metodo_tipo not in ('EFECTIVO', 'TRANSFERENCIA') then
    raise exception 'METODO_NO_DEVOLVIBLE';
  end if;

  -- ── Los renglones. El UPDATE condicional ES el guard de concurrencia.
  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_destino  := coalesce(v_linea->>'destino', 'STOCK');

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    if v_destino not in ('STOCK', 'BAJA') then
      raise exception 'DESTINO_INVALIDO';
    end if;

    update public.ventas_items
       set cantidad_devuelta = cantidad_devuelta + v_cantidad
     where id = (v_linea->>'venta_item_id')::uuid
       and venta_id = p_venta_id
       and negocio_id = v_negocio
       and cantidad_devuelta + v_cantidad <= cantidad
    returning * into v_item;

    if not found then
      -- O el renglón no es de esta venta, o se está devolviendo más de lo que
      -- queda. Las dos cosas son el mismo error para quien lo lee.
      raise exception 'DEVOLUCION_EXCEDE_LO_VENDIDO';
    end if;

    v_base := v_base + (v_item.precio_final * v_cantidad);

    -- Los renglones se acumulan y se insertan DESPUÉS de la cabecera: la FK de
    -- `devolucion_id` es NOT NULL, así que no hay forma de escribirlos antes.
    v_items := v_items || jsonb_build_object(
      'venta_item_id', v_item.id,
      'variante_id',   v_item.variante_id,
      'cantidad',      v_cantidad,
      'precio_final',  v_item.precio_final,
      'destino',       v_destino
    );
  end loop;

  -- ── El recargo, prorrateado
  --
  -- El descuento ya está adentro de `precio_final`, así que la base devuelta
  -- sale sola. El recargo no: vive en la cabecera y hay que repartirlo.
  --
  -- El reparto es proporcional a la base, y la ÚLTIMA devolución se lleva el
  -- remanente exacto en vez de su proporción redondeada. Sin eso, devolver un
  -- ticket en tres tandas puede dejar uno o dos pesos de recargo sin devolver
  -- para siempre, y esa diferencia no cierra contra ningún arqueo.
  select coalesce(sum(precio_final * cantidad), 0),
         coalesce(sum(precio_final * cantidad_devuelta), 0)
    into v_base_total, v_base_previa
    from public.ventas_items
   where venta_id = p_venta_id;

  v_recargo_total := coalesce(v_venta.recargo_metodo_total, 0);

  select coalesce(sum(recargo_devuelto), 0) into v_recargo_previo
    from public.devoluciones where venta_id = p_venta_id;

  v_todo_devuelto := v_base_previa >= v_base_total;

  if v_recargo_total <= 0 or v_base_total <= 0 then
    v_recargo := 0;
  elsif v_todo_devuelto then
    v_recargo := v_recargo_total - v_recargo_previo;
  else
    v_recargo := round(v_recargo_total * v_base / v_base_total);
  end if;

  v_monto := v_base + v_recargo;

  insert into public.devoluciones (
    negocio_id, venta_id, base_devuelta, recargo_devuelto, monto_devuelto,
    metodo_tipo, metodo_nombre, turno_caja_id, motivo_codigo, motivo_detalle,
    creado_por
  ) values (
    v_negocio, p_venta_id, v_base, v_recargo, v_monto,
    v_pago.metodo_tipo, v_pago.metodo_nombre,
    case when v_pago.metodo_tipo = 'EFECTIVO' then p_turno_id end,
    p_motivo_codigo,
    nullif(btrim(coalesce(p_motivo_detalle, '')), ''),
    v_usuario
  )
  returning id into v_devolucion_id;

  insert into public.devoluciones_items (
    negocio_id, devolucion_id, venta_item_id, variante_id,
    cantidad, precio_final, destino
  )
  select v_negocio, v_devolucion_id, r.venta_item_id, r.variante_id,
         r.cantidad, r.precio_final, r.destino
    from jsonb_to_recordset(v_items) as r(
      venta_item_id uuid, variante_id uuid, cantidad numeric,
      precio_final numeric, destino text
    );

  update public.ventas
     set monto_devuelto = coalesce(monto_devuelto, 0) + v_monto
   where id = p_venta_id;

  -- Solo el efectivo sale del cajón. Una venta cobrada por transferencia se
  -- devuelve por transferencia y la caja no la toca — es el mismo error que
  -- `anular_venta` ya corrigió una vez.
  if v_pago.metodo_tipo = 'EFECTIVO' and v_monto > 0 then
    insert into public.egresos (negocio_id, concepto, monto, creado_por, turno_caja_id)
    values (
      v_negocio,
      'Devolucion parcial - Venta #' || v_ticket,
      round(v_monto)::int,
      v_usuario,
      p_turno_id
    );
  end if;

  return jsonb_build_object(
    'devolucion_id', v_devolucion_id,
    'base_devuelta', v_base,
    'recargo_devuelto', v_recargo,
    'monto_devuelto', v_monto,
    'metodo_tipo', v_pago.metodo_tipo,
    'metodo_nombre', v_pago.metodo_nombre,
    'sale_de_caja', v_pago.metodo_tipo = 'EFECTIVO',
    'venta_totalmente_devuelta', v_base_previa >= v_base_total
  );
end;
$$;

comment on function public.registrar_devolucion(uuid, jsonb, text, text, uuid) is
  'Devuelve renglones sueltos de una venta cobrada con UN metodo, EFECTIVO o '
  'TRANSFERENCIA. Una transaccion: cantidad_devuelta con guard de concurrencia '
  'en el propio UPDATE, cabecera y renglones de la devolucion, recargo '
  'prorrateado por base, monto_devuelto de la venta y egreso de caja solo si '
  'era efectivo. El stock queda afuera, como en anular_venta. Ver 20260903160000.';

revoke all on function public.registrar_devolucion(uuid, jsonb, text, text, uuid) from public;
grant execute on function public.registrar_devolucion(uuid, jsonb, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.permisos where clave = 'ventas.devolver') then
    raise exception 'No se creo el permiso ventas.devolver.';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('devoluciones', 'devoluciones_items')
       and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'devoluciones no puede tener policy de UPDATE ni DELETE: es append-only.';
  end if;

  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'devoluciones'
         and policyname = 'aislamiento_negocio') <> 1 then
    raise exception 'devoluciones quedo sin policy de aislamiento.';
  end if;

  -- Ninguna venta puede quedar con mas devuelto que vendido.
  if exists (select 1 from public.ventas_items where cantidad_devuelta > cantidad) then
    raise exception 'Hay renglones con mas unidades devueltas que vendidas.';
  end if;
end $$;

commit;
