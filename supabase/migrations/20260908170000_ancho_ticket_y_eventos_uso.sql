-- ---------------------------------------------------------------------------
-- Dos cosas para poder imprimir el ticket: el ANCHO del papel y la TELEMETRÍA
-- que dice si alguien usa cada forma de entregar el comprobante.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. El ancho del papel térmico
--
-- Hoy está clavado en 80mm dentro del `@media print` de `ticket-sheet.tsx`.
-- Las térmicas del mercado son 58 o 80, y cuál tiene el comercio no se puede
-- adivinar ni deducir de nada que ya sepamos.
--
-- INTEGER Y NO TEXT porque es una medida y el CSS la usa como número
-- (`@page { size: 58mm auto }`). El CHECK es fail-closed igual que `rubro` o
-- `modo_caja`: sumar 76mm mañana exige migración, que es lo correcto.
--
-- DEFAULT 80 = exactamente lo que se imprime hoy. Los 8 negocios quedan igual.
-- ---------------------------------------------------------------------------

alter table public.configuracion_pos
  add column if not exists ancho_ticket_mm integer not null default 80;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'configuracion_pos_ancho_ticket_valido'
  ) then
    alter table public.configuracion_pos
      add constraint configuracion_pos_ancho_ticket_valido
      check (ancho_ticket_mm in (58, 80));
  end if;
end;
$$;

comment on column public.configuracion_pos.ancho_ticket_mm is
  'Ancho del papel de la impresora termica, en milimetros: 58 u 80. Solo afecta la impresion; el PDF es A4 y el texto de WhatsApp no tiene ancho.';


-- ---------------------------------------------------------------------------
-- 2. Telemetría de uso
--
-- POR QUÉ UNA TABLA NUEVA Y NO `eventos_comerz`. Esa tabla tiene UNA policy,
-- `security.is_super_admin()`, y alimenta el feed de /admincomerz. Escribir ahí
-- un evento por ticket entregado obligaría a abrirle el INSERT a cualquier
-- vendedora y ahogaría un feed que hoy tiene 21 filas de ciclo de vida del
-- SaaS. Son dos ejes distintos: aquello es "qué le pasó a un comercio", esto es
-- "qué hace la gente adentro del producto".
--
-- POR QUÉ TABLA Y NO SOLO GA4. GA4 ya está cargado y sirve, pero los datos
-- viven afuera y no se cruzan con `negocio_id` sin trabajo extra. La pregunta
-- que hay que contestar —"¿alguien usa el PDF?", por negocio y por mes— es una
-- consulta SQL de dos líneas si el dato está acá.
--
-- APPEND-ONLY POR RLS: hay policy de INSERT y de SELECT, y NO de UPDATE ni
-- DELETE. Mismo criterio que `comprobantes` y `movimientos_stock`.
--
-- LO QUE NO VA ACÁ: nada que sea plata ni identifique a un cliente. Es una
-- tabla de uso, y si mañana alguien quiere contar ventas, la fuente es
-- `ventas`. El `detalle` es jsonb opaco a propósito, igual que
-- `ordenes_borradores.payload`: su forma cambia con la pantalla que lo escribe.
-- ---------------------------------------------------------------------------

create table if not exists public.eventos_uso (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null default security.current_negocio_id(),
  -- Sin CHECK, y es deliberado: el valor de esta tabla es poder empezar a
  -- medir algo nuevo sin una migración. Lo que no se entiende al leer se
  -- ignora, que es el costo aceptable para un dato que no mueve plata.
  tipo       text not null,
  detalle    jsonb not null default '{}'::jsonb,
  -- Quién lo hizo. Sirve para la pregunta que sigue a "¿usan el PDF?", que es
  -- "¿lo usa una vendedora o solo la dueña?".
  creado_por uuid,
  creado_en  timestamptz not null default now(),

  constraint eventos_uso_tipo_no_vacio check (length(trim(tipo)) > 0)
);

create index if not exists idx_eventos_uso_negocio_tipo_fecha
  on public.eventos_uso (negocio_id, tipo, creado_en desc);

comment on table public.eventos_uso is
  'Telemetria de uso del producto: que acciones usa la gente. Append-only. Distinta de eventos_comerz, que es el ciclo de vida del SaaS y solo la ve el super admin.';
comment on column public.eventos_uso.tipo is
  'Etiqueta del evento, ej. COMPROBANTE_ENTREGADO. Sin CHECK: medir algo nuevo no tiene que costar una migracion.';
comment on column public.eventos_uso.detalle is
  'Contexto del evento, opaco para la base. Nada de plata ni de datos de clientes.';

alter table public.eventos_uso enable row level security;

-- Forma obligatoria del predicado: `negocio_id = (select ...)`, nunca
-- `security.same_negocio(negocio_id)` (ver 20260816100000).
create policy aislamiento_negocio on public.eventos_uso
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

-- Cualquiera que use el producto ESCRIBE: el evento lo genera el mostrador.
create policy eventos_uso_insert on public.eventos_uso
  for insert to authenticated with check (true);

-- Leer es otra cosa: es mirar qué hace el equipo. Solo ADMIN.
create policy eventos_uso_select_admin on public.eventos_uso
  for select to authenticated using ((select public.is_admin()));

-- SIN policy de UPDATE ni DELETE: append-only.


-- ---------------------------------------------------------------------------
-- GUARDS
-- ---------------------------------------------------------------------------
do $$
declare
  v_cuenta integer;
begin
  -- El ancho arranca en 80 para TODOS: es lo que se imprime hoy.
  select count(*) into v_cuenta
    from public.configuracion_pos where ancho_ticket_mm <> 80;
  if v_cuenta > 0 then
    raise exception 'Esta migracion no puede cambiarle el ancho de ticket a nadie (% filas distintas de 80).', v_cuenta;
  end if;

  -- `anon` no tiene nada que hacer con la telemetria del panel.
  select count(*) into v_cuenta
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'eventos_uso' and grantee = 'anon';
  if v_cuenta > 0 then
    raise exception 'eventos_uso no puede estar concedida a anon (% privilegios).', v_cuenta;
  end if;

  -- Append-only de verdad.
  select count(*) into v_cuenta
    from pg_policies
   where schemaname = 'public' and tablename = 'eventos_uso'
     and permissive = 'PERMISSIVE' and cmd in ('UPDATE', 'DELETE');
  if v_cuenta > 0 then
    raise exception 'eventos_uso tiene % policies de UPDATE/DELETE: tiene que ser append-only.', v_cuenta;
  end if;
end;
$$;
