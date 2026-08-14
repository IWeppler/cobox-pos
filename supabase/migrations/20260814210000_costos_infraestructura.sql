-- Lo que cuesta correr Comerz, por mes y proveedor.
--
-- Cargado a mano, igual que los pagos: no hay API de facturación de Vercel ni
-- de Supabase conectada, y estimar el costo sería inventar el número que
-- justamente sirve para saber si el precio alcanza.
--
-- Sin esto el panel muestra ingresos y nunca cuánto queda, que es la única
-- cuenta que dice si el negocio cierra.

create table if not exists public.costos_infra (
  id uuid primary key default gen_random_uuid(),
  -- Primer día del mes que cubre. `date` y no (año, mes) para poder ordenar y
  -- comparar rangos sin rearmar la fecha en cada consulta.
  mes date not null,
  proveedor text not null check (proveedor in ('vercel','supabase','dominio','otro')),
  monto numeric(12,2) not null check (monto >= 0),
  nota text,
  creado_en timestamptz not null default now(),
  registrado_por uuid references auth.users(id)
);

-- Un proveedor, un mes, una fila: cargar Vercel dos veces para el mismo mes
-- duplicaría el costo y hundiría el margen sin que se note de dónde salió.
create unique index if not exists uq_costos_infra_mes_proveedor
  on public.costos_infra (mes, proveedor);

create index if not exists idx_costos_infra_mes
  on public.costos_infra (mes desc);

alter table public.costos_infra enable row level security;

-- Solo Comerz: es información de la empresa, no de ningún comercio.
create policy costos_infra_super_admin on public.costos_infra
  for all using (security.is_super_admin())
  with check (security.is_super_admin());

grant select, insert, update, delete on public.costos_infra to authenticated;
