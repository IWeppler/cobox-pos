-- Comprobantes emitidos: qué papel salió por cada venta.
--
-- Hoy `ventas` no tiene UNA sola columna fiscal. No hay forma de saber si una
-- venta salió como ticket interno o como factura, con qué número, ni a nombre
-- de quién. Eso significa que la contabilidad no se puede reconstruir desde el
-- sistema, y que lo ya vendido NO es recuperable hacia atrás: solo va a haber
-- datos desde que exista esta tabla. Por eso entra antes que ARCA y no después.
--
-- Tabla aparte y no columnas en `ventas`, por dos razones que se ven recién
-- cuando ARCA está conectado:
--   1. Una venta puede tener MÁS de un comprobante. Anular una factura no se
--      hace editándola: se emite una nota de crédito, que es su propio
--      comprobante con su propio CAE y su propio número.
--   2. Un comprobante es inmutable (ver más abajo) y una venta no lo es
--      (estado_pago se mueve con cada cobro de cuenta corriente).

create table if not exists public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null default security.current_negocio_id()
    references public.negocios(id),

  -- ON DELETE RESTRICT: un comprobante emitido no puede desaparecer porque
  -- alguien borró la venta. Es al revés — la venta no se puede borrar mientras
  -- exista el comprobante. Es el criterio opuesto al de
  -- producto_variantes_auditoria (que sobrevive sin FK): acá el vínculo con la
  -- venta ES el dato contable.
  venta_id uuid not null references public.ventas(id) on delete restrict,

  tipo text not null,

  -- Punto de venta y número: juntos identifican el comprobante ante ARCA.
  -- `numero` es bigint porque la numeración de ARCA no se reinicia.
  punto_venta integer not null,
  numero bigint not null,

  -- Datos del RECEPTOR congelados al momento de emitir. Mismo criterio que el
  -- recargo congelado en venta_pagos: si mañana la clienta corrige su CUIT, la
  -- factura que ya se emitió tiene que seguir diciendo lo que decía. Leerlos
  -- por join contra `clientes` los haría cambiar solos.
  cliente_id uuid references public.clientes(id) on delete set null,
  receptor_razon_social text,
  receptor_cuit text,
  receptor_condicion_iva text,

  -- Importes congelados, por el mismo motivo. `neto` e `iva_monto` solo se
  -- discriminan en Factura A; en B y C el total ya viene con el IVA adentro y
  -- quedan en 0, que es lo que corresponde imprimir.
  neto numeric(14, 2) not null default 0,
  iva_monto numeric(14, 2) not null default 0,
  total numeric(14, 2) not null,

  -- Respuesta de ARCA. Todo NULL mientras el comercio no esté conectado: un
  -- TICKET interno no tiene CAE y nunca lo va a tener.
  cae text,
  cae_vencimiento date,

  -- Si este comprobante anula a otro (nota de crédito → factura original).
  anula_comprobante_id uuid references public.comprobantes(id),

  emitido_por uuid references auth.users(id),
  emitido_en timestamptz not null default now()
);

alter table public.comprobantes
  drop constraint if exists comprobantes_tipo_check;

-- Fail-closed. Las notas de crédito entran desde el principio aunque todavía
-- nada las emita: son el único mecanismo válido para revertir una factura, y
-- dejarlas afuera invitaría a "arreglarlo" con un UPDATE cuando aparezcan.
alter table public.comprobantes
  add constraint comprobantes_tipo_check
  check (tipo in (
    'TICKET',
    'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
    'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C'
  ));

alter table public.comprobantes
  drop constraint if exists comprobantes_numeracion_valida_check;

alter table public.comprobantes
  add constraint comprobantes_numeracion_valida_check
  check (punto_venta between 1 and 99999 and numero >= 1);

alter table public.comprobantes
  drop constraint if exists comprobantes_ticket_sin_cae_check;

-- Un ticket interno con CAE sería un comprobante fiscal disfrazado de no
-- fiscal; una factura sin CAE, un papel inválido. Las dos direcciones se
-- frenan acá y no en el código, porque las dos son plata.
alter table public.comprobantes
  add constraint comprobantes_ticket_sin_cae_check
  check (
    case when tipo = 'TICKET' then cae is null else true end
  );

alter table public.comprobantes
  drop constraint if exists comprobantes_importes_coherentes_check;

alter table public.comprobantes
  add constraint comprobantes_importes_coherentes_check
  check (neto >= 0 and iva_monto >= 0 and total >= 0);

-- LA restricción de la tabla: no puede haber dos comprobantes del mismo tipo
-- con el mismo número en el mismo punto de venta. La numeración correlativa
-- sin huecos ni repetidos es requisito de ARCA, y un índice único es lo único
-- que lo garantiza bajo concurrencia (dos cajas vendiendo a la vez).
create unique index if not exists comprobantes_numeracion_unica_idx
  on public.comprobantes (negocio_id, punto_venta, tipo, numero);

-- Buscar el comprobante de una venta (ticket, detalle de venta, reportes).
create index if not exists comprobantes_venta_idx
  on public.comprobantes (venta_id);

-- Libro de IVA ventas: todos los comprobantes de un negocio en un período.
create index if not exists comprobantes_negocio_emitido_idx
  on public.comprobantes (negocio_id, emitido_en desc);

alter table public.comprobantes enable row level security;

drop policy if exists aislamiento_negocio on public.comprobantes;
create policy aislamiento_negocio on public.comprobantes
  as restrictive for all to authenticated
  using (security.same_negocio(negocio_id))
  with check (security.same_negocio(negocio_id));

drop policy if exists comprobantes_select on public.comprobantes;
create policy comprobantes_select on public.comprobantes
  for select to authenticated
  using (true);

drop policy if exists comprobantes_insert on public.comprobantes;
create policy comprobantes_insert on public.comprobantes
  for insert to authenticated
  with check (true);

-- NO hay policy de UPDATE ni de DELETE, y es a propósito: un comprobante
-- emitido es inmutable. Sin policy, RLS las deniega — no hace falta un trigger
-- que "avise". Corregir una factura no es editarla, es emitir una nota de
-- crédito (anula_comprobante_id). Mismo criterio que el turno de caja cerrado.

comment on table public.comprobantes is
  'Comprobantes emitidos por venta. INMUTABLE: sin policy de UPDATE/DELETE. Se corrige emitiendo una nota de crédito que apunte al original via anula_comprobante_id.';
comment on column public.comprobantes.receptor_cuit is
  'Congelado al emitir. NO leer los datos del receptor por join contra clientes: la factura emitida no puede cambiar porque el cliente editó su ficha.';


-- Numeración correlativa
--
-- ALCANCE, que importa: esto es la fuente de verdad SOLO para TICKET, que es
-- numeración interna del comercio. Para los comprobantes fiscales la autoridad
-- es ARCA (FECompUltimoAutorizado), no esta tabla; cuando se conecte, el flujo
-- va a tener que sincronizar contra ARCA antes de emitir. Se deja modelado
-- igual para que el número no salga nunca de un `select max(numero) + 1`, que
-- es el bug que este repo ya pagó dos veces (merge-purchase y cancel-sale): dos
-- llamadas concurrentes leen lo mismo y las dos escriben el mismo número.

create table if not exists public.comprobante_numeracion (
  negocio_id uuid not null default security.current_negocio_id()
    references public.negocios(id),
  punto_venta integer not null,
  tipo text not null,
  ultimo_numero bigint not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (negocio_id, punto_venta, tipo)
);

alter table public.comprobante_numeracion enable row level security;

drop policy if exists aislamiento_negocio on public.comprobante_numeracion;
create policy aislamiento_negocio on public.comprobante_numeracion
  as restrictive for all to authenticated
  using (security.same_negocio(negocio_id))
  with check (security.same_negocio(negocio_id));

drop policy if exists comprobante_numeracion_todo on public.comprobante_numeracion;
create policy comprobante_numeracion_todo on public.comprobante_numeracion
  for all to authenticated
  using (true)
  with check (true);

create or replace function public.siguiente_numero_comprobante(
  p_punto_venta integer,
  p_tipo text
)
returns bigint
language plpgsql
-- search_path fijo: sin esto un rol podría anteponer un esquema propio y
-- hacer que `comprobante_numeracion` resuelva a otra tabla.
set search_path = public, pg_temp
as $$
declare
  v_numero bigint;
begin
  -- Un solo statement a propósito. El `on conflict do update` toma el row lock
  -- sobre la fila de numeración, así que dos ventas simultáneas se serializan
  -- y cada una se lleva un número distinto. Partirlo en select + update
  -- reintroduce exactamente la carrera que esto viene a evitar.
  insert into public.comprobante_numeracion as n
    (punto_venta, tipo, ultimo_numero)
  values (p_punto_venta, p_tipo, 1)
  on conflict (negocio_id, punto_venta, tipo) do update
    set ultimo_numero = n.ultimo_numero + 1,
        actualizado_en = now()
  returning n.ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.siguiente_numero_comprobante(integer, text) is
  'Devuelve el siguiente número correlativo, serializado por row lock. Autoridad SOLO para TICKET: para comprobantes fiscales el último número autorizado lo dice ARCA.';
