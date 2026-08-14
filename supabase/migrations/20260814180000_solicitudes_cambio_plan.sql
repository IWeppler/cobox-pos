-- Pedidos de cambio de plan hechos por el comercio.
--
-- Reemplaza al `mailto:` de Perfil > Suscripción, que abría el cliente de
-- correo del sistema: en una PC de comercio con Outlook instalado y sin cuenta
-- configurada, eso es un asistente de configuración de cuenta. La vendedora lo
-- cierra y el pedido no llega nunca. Acá queda una fila que se ve en
-- /admincomerz.
--
-- La solicitud NO cambia el plan sola, y es deliberado: el plan se cambia
-- cuando el pago está acordado, y ese acuerdo pasa fuera del sistema. Un botón
-- que se auto-asigna el plan de arriba es regalar el producto.

create table if not exists public.solicitudes_plan (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  -- Congelado a propósito: si el cambio se aplica dos semanas después, la
  -- solicitud tiene que seguir diciendo desde dónde se pidió.
  plan_actual text,
  plan_solicitado_id uuid references public.planes(id) on delete set null,
  plan_solicitado_nombre text not null,
  modalidad text not null default 'mensual',
  nota text,
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE','APLICADA','RECHAZADA')),
  solicitado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users(id)
);

create index if not exists idx_solicitudes_plan_pendientes
  on public.solicitudes_plan (estado, creado_en desc)
  where estado = 'PENDIENTE';

-- Una sola solicitud abierta por negocio: insistir no acelera nada y el panel
-- no tiene por qué mostrar tres veces el mismo pedido.
create unique index if not exists uq_solicitud_plan_pendiente_por_negocio
  on public.solicitudes_plan (negocio_id)
  where estado = 'PENDIENTE';

alter table public.solicitudes_plan enable row level security;

create policy solicitudes_plan_aislamiento on public.solicitudes_plan
  as restrictive for all
  using (security.same_negocio(negocio_id) or security.is_super_admin())
  with check (security.same_negocio(negocio_id) or security.is_super_admin());

create policy solicitudes_plan_select_propio on public.solicitudes_plan
  for select using (negocio_id = security.current_negocio_id());

create policy solicitudes_plan_insert_admin on public.solicitudes_plan
  for insert with check (
    negocio_id = security.current_negocio_id() and public.is_admin()
  );

create policy solicitudes_plan_select_super_admin on public.solicitudes_plan
  for select using (security.is_super_admin());

-- Resolver es solo de Comerz: el comercio pide, no cierra su propio pedido.
create policy solicitudes_plan_update_super_admin on public.solicitudes_plan
  for update using (security.is_super_admin())
  with check (security.is_super_admin());

grant select, insert, update on public.solicitudes_plan to authenticated;
