-- Panel de Comerz: historial de pagos, feed de eventos y slugs históricos.
--
-- Las tres piezas que le faltaban a /admincomerz para dejar de ser una lista
-- de comercios y poder operar el negocio: qué se cobró, qué pasó, y poder
-- cambiarle el link a una tienda sin romper lo que ya se compartió.

-- ---------------------------------------------------------------------------
-- 1. Historial de pagos.
--
-- No hay pasarela ni cobro automático: los pagos se cargan a mano. Esta tabla
-- es lo que DE VERDAD se cobró, no lo que se espera cobrar — por eso no se
-- deriva de `plan_vencimiento` ni al revés: es al registrar un pago que el
-- vencimiento se mueve, nunca a la inversa.
--
-- `plan_nombre` va congelado en la fila, mismo criterio que en `comprobantes`
-- y en `venta_pagos`: el plan del negocio puede cambiar después, y un pago
-- tiene que seguir diciendo qué se estaba pagando.
-- ---------------------------------------------------------------------------
create table if not exists public.pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  monto numeric(12,2) not null check (monto >= 0),
  fecha_pago date not null default current_date,
  periodo_desde date not null,
  periodo_hasta date not null,
  medio text not null default 'transferencia'
    check (medio in ('transferencia','mercadopago','efectivo','otro')),
  plan_nombre text,
  nota text,
  registrado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  check (periodo_hasta > periodo_desde)
);

create index if not exists idx_pagos_suscripcion_negocio
  on public.pagos_suscripcion (negocio_id, fecha_pago desc);

alter table public.pagos_suscripcion enable row level security;

create policy pagos_suscripcion_super_admin on public.pagos_suscripcion
  for all using (security.is_super_admin())
  with check (security.is_super_admin());

-- El comercio ve SUS pagos y nada más, y no puede escribir: cobrar no es algo
-- que el cliente declare.
create policy pagos_suscripcion_select_propio on public.pagos_suscripcion
  for select using (negocio_id = security.current_negocio_id());

grant select, insert, update, delete on public.pagos_suscripcion to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Eventos.
--
-- SOLO hechos puntuales: pasaron una vez, en un instante, y no cambian. Lo que
-- es ESTADO —vencido, en prueba, sin plan— NO va acá: se deriva en vivo al
-- armar el feed. Es el mismo criterio del checklist de activación, y por la
-- misma razón: un "venció el mes" guardado como fila necesitaría un cron que
-- lo genere y otro que lo borre cuando el comercio paga, y entre medio miente.
-- ---------------------------------------------------------------------------
create table if not exists public.eventos_comerz (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references public.negocios(id) on delete cascade,
  tipo text not null check (tipo in (
    'NEGOCIO_CREADO','SOLICITUD_PLAN','PAGO_REGISTRADO',
    'PLAN_CAMBIADO','ESTADO_CAMBIADO','SLUG_CAMBIADO'
  )),
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  visto_en timestamptz
);

create index if not exists idx_eventos_comerz_feed
  on public.eventos_comerz (creado_en desc);
create index if not exists idx_eventos_comerz_sin_ver
  on public.eventos_comerz (creado_en desc) where visto_en is null;

alter table public.eventos_comerz enable row level security;

create policy eventos_comerz_super_admin on public.eventos_comerz
  for all using (security.is_super_admin())
  with check (security.is_super_admin());

grant select, insert, update on public.eventos_comerz to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Slugs históricos.
--
-- Los catálogos se comparten por WhatsApp y quedan meses en chats y estados.
-- Sin esta tabla, cambiarle el link a una tienda mata en silencio toda venta
-- que venga de un link viejo, y nadie se entera: el que abre ve un 404 y se va.
-- ---------------------------------------------------------------------------
create table if not exists public.slugs_historicos (
  slug text primary key,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create index if not exists idx_slugs_historicos_negocio
  on public.slugs_historicos (negocio_id);

alter table public.slugs_historicos enable row level security;

-- anon lee: el redirect del catálogo público se resuelve sin sesión.
create policy slugs_historicos_select_publico on public.slugs_historicos
  for select using (true);

create policy slugs_historicos_super_admin on public.slugs_historicos
  for all using (security.is_super_admin())
  with check (security.is_super_admin());

grant select on public.slugs_historicos to anon, authenticated;
grant insert, delete on public.slugs_historicos to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Los eventos los generan TRIGGERS, no el código.
--
-- Si dependieran de que cada action se acuerde de insertarlos, el primer
-- camino nuevo que cambie un plan desde otro lado deja el feed incompleto —
-- y un feed incompleto es peor que no tenerlo, porque se confía en él.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_evento_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.eventos_comerz (negocio_id, tipo, detalle)
    VALUES (NEW.id, 'NEGOCIO_CREADO', jsonb_build_object('nombre', NEW.nombre));
    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    INSERT INTO public.eventos_comerz (negocio_id, tipo, detalle)
    VALUES (NEW.id, 'PLAN_CAMBIADO', jsonb_build_object(
      'desde', (select nombre from public.planes where id = OLD.plan_id),
      'hasta', (select nombre from public.planes where id = NEW.plan_id)
    ));
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO public.eventos_comerz (negocio_id, tipo, detalle)
    VALUES (NEW.id, 'ESTADO_CAMBIADO', jsonb_build_object(
      'desde', OLD.estado, 'hasta', NEW.estado
    ));
  END IF;

  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    -- ON CONFLICT porque un negocio puede volver a un slug que ya tuvo.
    INSERT INTO public.slugs_historicos (slug, negocio_id)
    VALUES (OLD.slug, NEW.id)
    ON CONFLICT (slug) DO UPDATE SET negocio_id = excluded.negocio_id;

    -- Y si el slug NUEVO estaba en el historial, deja de ser histórico: ahora
    -- es el vigente y no puede redirigir a sí mismo (loop infinito).
    DELETE FROM public.slugs_historicos WHERE slug = NEW.slug;

    INSERT INTO public.eventos_comerz (negocio_id, tipo, detalle)
    VALUES (NEW.id, 'SLUG_CAMBIADO', jsonb_build_object(
      'desde', OLD.slug, 'hasta', NEW.slug
    ));
  END IF;

  RETURN NEW;
END;
$$;

drop trigger if exists trg_evento_negocio on public.negocios;
create trigger trg_evento_negocio
  after insert or update on public.negocios
  for each row execute function public.registrar_evento_negocio();

create or replace function public.registrar_evento_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  INSERT INTO public.eventos_comerz (negocio_id, tipo, detalle)
  VALUES (NEW.negocio_id, 'PAGO_REGISTRADO', jsonb_build_object(
    'monto', NEW.monto, 'periodo_hasta', NEW.periodo_hasta, 'medio', NEW.medio
  ));
  RETURN NEW;
END;
$$;

drop trigger if exists trg_evento_pago on public.pagos_suscripcion;
create trigger trg_evento_pago
  after insert on public.pagos_suscripcion
  for each row execute function public.registrar_evento_pago();

create or replace function public.registrar_evento_solicitud_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  INSERT INTO public.eventos_comerz (negocio_id, tipo, detalle)
  VALUES (NEW.negocio_id, 'SOLICITUD_PLAN', jsonb_build_object(
    'desde', NEW.plan_actual, 'hasta', NEW.plan_solicitado_nombre
  ));
  RETURN NEW;
END;
$$;

drop trigger if exists trg_evento_solicitud_plan on public.solicitudes_plan;
create trigger trg_evento_solicitud_plan
  after insert on public.solicitudes_plan
  for each row execute function public.registrar_evento_solicitud_plan();

-- ---------------------------------------------------------------------------
-- 5. Backfill.
--
-- El feed no puede nacer ignorando a los comercios que ya existen. Se usa su
-- `created_at` real para que el orden sea el verdadero, y se marcan como
-- vistos: son historia, no cosas para atender hoy.
-- ---------------------------------------------------------------------------
insert into public.eventos_comerz (negocio_id, tipo, detalle, creado_en, visto_en)
select n.id, 'NEGOCIO_CREADO', jsonb_build_object('nombre', n.nombre),
       n.created_at, now()
from public.negocios n
where not exists (
  select 1 from public.eventos_comerz e
  where e.negocio_id = n.id and e.tipo = 'NEGOCIO_CREADO'
);
