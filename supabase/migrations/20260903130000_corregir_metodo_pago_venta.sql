-- Corregir el MÉTODO DE PAGO de una venta ya registrada, con auditoría.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ EXISTE: lo medido, no lo supuesto
--
-- El historial de Evens dice que la operación que más falta no es devolver un
-- renglón: es corregir el medio de cobro. De las 24 anulaciones fechables de
-- los últimos 90 días, 10 (41,7%) están seguidas de una venta del mismo
-- producto dentro de la hora, contra un 13,1% de base en las 626 ventas no
-- anuladas del período. Y al abrir los 4 casos donde el total coincide exacto,
-- los 4 son cambios de método:
--
--     2 min    TARJETA   -> TRANSFERENCIA
--     4 min    EFECTIVO  -> CUENTA CORRIENTE
--    12 min    EFECTIVO  -> TRANSFERENCIA
--   332 min    EFECTIVO  -> TRANSFERENCIA   (además cambió la clienta)
--
-- Tres de cuatro dentro de los 12 minutos: la vendedora se da cuenta en el
-- acto de que cobró de otra forma y hoy su única herramienta es ANULAR y
-- volver a cargar la venta entera. Eso mueve stock dos veces, saca plata de la
-- caja y la vuelve a meter, deja una venta anulada en el historial y —en
-- Evens, donde nadie tiene rol ENCARGADO— necesita a la dueña, porque
-- `ventas.anular` no la tienen las vendedoras.
--
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ NO HACE, Y POR QUÉ
--
-- 1. NO convierte una venta cobrada en fiada ni al revés. Ese era el segundo
--    caso de la lista (EFECTIVO -> CUENTA CORRIENTE) y queda afuera a
--    propósito: crea deuda, exige cliente, recalcula el recargo de cuenta
--    corriente, mueve `clientes.saldo_pendiente` y escribe en el libro mayor.
--    Es otra operación con otro riesgo, no un caso más de esta.
--
-- 2. NO toca ventas con más de un cobro. Son 6 de 467 en 30 días (1,3%) y con
--    pago mixto "cambiar el método" no significa nada sin decir de cuál de los
--    dos se habla. Fail-closed: se rechaza y se anula como hasta ahora.
--
-- 3. NO toca un turno cerrado. Es el freno más importante de esta función.
--    El efectivo esperado de un turno se calcula sumando `venta_pagos` con
--    `metodo_tipo = 'EFECTIVO'` (ver posicion_dinero, resumen_gerencial_caja y
--    caja_por_negocio). Cambiar el método de un cobro mientras el turno está
--    ABIERTO corrige el arqueo, que es justo lo que se busca. Hacerlo sobre un
--    turno CERRADO reescribe un arqueo que alguien ya contó, firmó y cuadró:
--    el faltante o sobrante aparecería después, contra un número que ya no se
--    puede explicar. Un turno cerrado es inmutable para todos, y eso no cambia
--    acá. Cubre 3 de los 4 casos medidos; el de 332 minutos se sigue
--    resolviendo anulando.
--
-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER, y es una decisión incómoda que hay que justificar
--
-- El resto de las RPC que mueven plata son SECURITY INVOKER para que el freno
-- siga siendo la RLS. Acá no se puede: la policy de UPDATE sobre `ventas`
-- (`ventas_update_propia_o_admin`) exige `tiene_permiso('ventas.anular')`, que
-- es el permiso de ANULAR — y el punto entero de esta función es que la
-- vendedora pueda corregir su propio cobro sin poder anular. Ampliar esa
-- policy con un OR sería peor: le abriría a la vendedora el UPDATE directo por
-- PostgREST sobre `ventas`, o sea poder escribir cualquier columna, total
-- incluido.
--
-- Entonces: DEFINER, y los cuatro chequeos que la RLS haría quedan escritos
-- explícitos y primero — negocio activo, pertenencia de la venta al negocio,
-- permiso `ventas.corregir_pago`, y que la venta sea propia salvo que tenga
-- `ventas.ver_todas`. Ninguna fila se toca antes de pasarlos.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ---------------------------------------------------------------------------
-- 1. La auditoría
--
-- Tabla propia y no columnas en `ventas` porque una venta puede corregirse más
-- de una vez, y porque lo que interesa no es el estado final sino la
-- SECUENCIA: "se cobró en efectivo, a los 4 minutos se pasó a transferencia".
-- Con columnas, la segunda corrección pisa a la primera.
--
-- Append-only por RLS: hay policy de SELECT e INSERT y no de UPDATE ni DELETE.
-- Mismo criterio que `comprobantes`, `movimientos_stock` y `catalogo_borrados`
-- — una auditoría que se puede editar no es una auditoría.
-- ---------------------------------------------------------------------------
create table if not exists public.ventas_correcciones (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      uuid not null default security.current_negocio_id(),
  venta_id        uuid not null references public.ventas(id) on delete restrict,
  -- Arranca con un solo valor y con CHECK: agregar 'CLIENTE' o 'ITEMS' es
  -- deliberado, no algo que se cuele con un typo. Fail-closed como el resto.
  campo           text not null check (campo in ('METODO_PAGO')),
  -- El antes y el después COMPLETOS, congelados. No se leen por join contra
  -- `metodos_pago`: si mañana se renombra o se borra un método, la corrección
  -- tiene que seguir diciendo lo que decía. Mismo criterio que los datos del
  -- receptor en `comprobantes` y el recargo en `venta_pagos`.
  valor_anterior  jsonb not null,
  valor_nuevo     jsonb not null,
  motivo          text,
  corregido_por   uuid,
  corregido_en    timestamptz not null default now()
);

comment on table public.ventas_correcciones is
  'Auditoría de correcciones sobre ventas ya registradas: qué campo, con qué valor antes y después, quién y cuándo. Append-only por RLS. Ver 20260903130000.';

comment on column public.ventas_correcciones.valor_anterior is
  'Snapshot congelado, no una referencia: la corrección tiene que poder leerse aunque el método de pago involucrado se borre o se renombre.';

create index if not exists idx_ventas_correcciones_venta
  on public.ventas_correcciones (negocio_id, venta_id, corregido_en);

alter table public.ventas_correcciones enable row level security;

-- Aislamiento con la forma que usa el índice: `negocio_id = (select ...)`,
-- NUNCA `same_negocio(negocio_id)` (ver 20260816100000).
create policy aislamiento_negocio on public.ventas_correcciones
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

create policy ventas_correcciones_select on public.ventas_correcciones
  for select to authenticated using (true);

create policy ventas_correcciones_insert on public.ventas_correcciones
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- 2. El permiso
--
-- SEPARADO de `ventas.anular` a propósito, y ese es medio punto de esta
-- migración. Corregir el medio de cobro de la venta propia, en el turno
-- propio todavía abierto, no mueve mercadería ni cancela nada: es la clase de
-- error que se comete y se arregla en el mismo minuto. Anular es otra cosa.
--
-- Se otorga a los tres roles de sistema. En Evens eso significa que las cuatro
-- vendedoras pueden corregir su propio cobro sin poder anular nada — que es
-- exactamente la situación que hoy obliga a llamar a la dueña.
-- ---------------------------------------------------------------------------
insert into public.permisos (clave, modulo, descripcion)
values (
  'ventas.corregir_pago',
  'ventas',
  'Corregir el método de pago de una venta propia mientras el turno sigue abierto'
)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol_id, permiso_id, negocio_id)
select r.id, p.id, r.negocio_id
from public.roles r
cross join public.permisos p
where p.clave = 'ventas.corregir_pago'
  and r.nombre in ('ADMIN', 'ENCARGADO', 'VENDEDOR')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. La función
-- ---------------------------------------------------------------------------
create or replace function public.corregir_metodo_pago_venta(
  p_venta_id uuid,
  p_metodo_pago_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_negocio    uuid := security.current_negocio_id();
  v_usuario    uuid := auth.uid();
  v_venta      public.ventas%rowtype;
  v_pago       public.venta_pagos%rowtype;
  v_metodo     public.metodos_pago%rowtype;
  v_turno      public.turnos_caja%rowtype;
  v_cobros     int;
  v_base       numeric;
  v_recargo    numeric;
  v_bruto      numeric;
  v_comision   numeric;
  v_total      numeric;
  v_legacy     text;
  v_anterior   jsonb;
begin
  -- ── Los cuatro chequeos que reemplazan a la RLS. Van primero y no se toca
  -- ── ninguna fila hasta pasarlos. Ver el encabezado.
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  if not public.tiene_permiso('ventas.corregir_pago') then
    raise exception 'SIN_PERMISO';
  end if;

  -- `for update` y no un select suelto: es el lock que serializa dos
  -- correcciones simultáneas de la misma venta. Sin él, dos pestañas eligiendo
  -- métodos distintos dejan la fila con uno y la auditoría diciendo el otro.
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or v_venta.negocio_id is distinct from v_negocio then
    raise exception 'VENTA_INEXISTENTE';
  end if;

  if v_venta.vendedor_id is distinct from v_usuario
     and not public.tiene_permiso('ventas.ver_todas') then
    raise exception 'VENTA_AJENA';
  end if;

  -- ── Qué ventas se pueden corregir
  if v_venta.estado_operacion <> 'CONFIRMADA' then
    raise exception 'VENTA_NO_CORREGIBLE';
  end if;

  -- Fuera de alcance: una venta con deuda se corrige tocando el libro de
  -- cuenta corriente, no esta función.
  if coalesce(v_venta.monto_pendiente, 0) > 0 then
    raise exception 'VENTA_CON_DEUDA';
  end if;

  select count(*) into v_cobros
    from public.venta_pagos
   where venta_id = p_venta_id
     and tipo_movimiento = 'PAGO_VENTA';

  if v_cobros <> 1 then
    raise exception 'VENTA_SIN_UN_UNICO_COBRO';
  end if;

  select * into v_pago
    from public.venta_pagos
   where venta_id = p_venta_id
     and tipo_movimiento = 'PAGO_VENTA'
   for update;

  if v_pago.estado_pago_operacion <> 'CONFIRMADO' then
    raise exception 'COBRO_NO_CONFIRMADO';
  end if;

  -- ── El turno tiene que seguir abierto. Ver el encabezado: es el freno que
  -- ── impide reescribir un arqueo ya cuadrado.
  select * into v_turno
    from public.turnos_caja
   where id = coalesce(v_pago.turno_caja_id, v_venta.turno_caja_id);

  if not found or v_turno.estado <> 'ABIERTO' then
    raise exception 'TURNO_CERRADO';
  end if;

  -- ── El método destino
  select * into v_metodo
    from public.metodos_pago
   where id = p_metodo_pago_id
     and negocio_id = v_negocio
     and activo;

  if not found then
    raise exception 'METODO_INEXISTENTE';
  end if;

  if v_metodo.id = v_pago.metodo_pago_id then
    raise exception 'MISMO_METODO';
  end if;

  -- ── La aritmética
  --
  -- La BASE no se toca: es lo que vale la mercadería y no cambia porque haya
  -- cambiado con qué se pagó. Lo que se recalcula es todo lo que depende del
  -- método — recargo al cliente, comisión del procesador, días de
  -- acreditación — con el mismo redondeo al peso que `calcularRecargoMonto`
  -- de shared/lib/recargo-metodo.ts.
  --
  -- OJO: si los dos métodos tienen recargos distintos, el TOTAL de la venta
  -- cambia. No es un efecto colateral, es la corrección: si se cobró como
  -- tarjeta al 15% y en realidad fue transferencia, el ticket estuvo mal desde
  -- el momento cero y el cliente pagó otra cosa. La función devuelve el total
  -- viejo y el nuevo para que la app pueda decir cuánto hay que devolver o
  -- cobrar de diferencia; no lo resuelve sola porque esa plata se mueve a
  -- mano en el mostrador.
  v_base     := coalesce(v_pago.monto_base, v_pago.monto_bruto);
  v_recargo  := round(v_base * coalesce(v_metodo.recargo_porcentaje, 0) / 100);
  v_bruto    := v_base + v_recargo;
  v_comision := round(v_bruto * coalesce(v_metodo.comision, 0) / 100, 2);
  v_total    := v_venta.total - coalesce(v_venta.recargo_metodo_total, 0) + v_recargo;

  -- El texto legacy de `ventas.metodo_pago` tiene su propio CHECK, que NO
  -- incluye BILLETERA_VIRTUAL. El mapeo es el mismo que hace create-sale.ts
  -- al registrar la venta (buscar `metodoPagoSafe`): los dos tienen que decir
  -- lo mismo o la misma venta se contaría distinto según cómo se cargó.
  v_legacy := case v_metodo.tipo
                when 'TRANSFERENCIA' then 'TRANSFERENCIA'
                when 'TARJETA' then 'TARJETA'
                when 'BILLETERA_VIRTUAL' then 'TARJETA'
                else 'EFECTIVO'
              end;

  v_anterior := jsonb_build_object(
    'metodo_pago_id',      v_pago.metodo_pago_id,
    'metodo_nombre',       v_pago.metodo_nombre,
    'metodo_tipo',         v_pago.metodo_tipo,
    'recargo_porcentaje',  v_pago.recargo_porcentaje,
    'recargo_monto',       v_pago.recargo_monto,
    'monto_bruto',         v_pago.monto_bruto,
    'comision_monto',      v_pago.comision_monto,
    'total_venta',         v_venta.total
  );

  -- ── Las escrituras, todas en esta transacción
  update public.venta_pagos
     set metodo_pago_id     = v_metodo.id,
         metodo_nombre      = v_metodo.nombre,
         metodo_tipo        = v_metodo.tipo,
         recargo_porcentaje = coalesce(v_metodo.recargo_porcentaje, 0),
         recargo_monto      = v_recargo,
         monto_bruto        = v_bruto,
         comision_porcentaje= coalesce(v_metodo.comision, 0),
         comision_monto     = v_comision,
         monto_neto         = v_bruto - v_comision,
         acreditacion_dias  = coalesce(v_metodo.acreditacion_dias, 0)
   where id = v_pago.id;

  update public.ventas
     set metodo_pago          = v_legacy,
         recargo_metodo_total = v_recargo,
         total                = v_total,
         monto_cobrado        = v_bruto,
         total_bruto          = v_bruto,
         comision_total       = v_comision,
         total_neto           = v_bruto - v_comision
   where id = p_venta_id;

  insert into public.ventas_correcciones (
    negocio_id, venta_id, campo, valor_anterior, valor_nuevo, motivo, corregido_por
  ) values (
    v_negocio, p_venta_id, 'METODO_PAGO', v_anterior,
    jsonb_build_object(
      'metodo_pago_id',     v_metodo.id,
      'metodo_nombre',      v_metodo.nombre,
      'metodo_tipo',        v_metodo.tipo,
      'recargo_porcentaje', coalesce(v_metodo.recargo_porcentaje, 0),
      'recargo_monto',      v_recargo,
      'monto_bruto',        v_bruto,
      'comision_monto',     v_comision,
      'total_venta',        v_total
    ),
    nullif(btrim(coalesce(p_motivo, '')), ''),
    v_usuario
  );

  return jsonb_build_object(
    'metodo_anterior',   v_pago.metodo_nombre,
    'metodo_nuevo',      v_metodo.nombre,
    'total_anterior',    v_venta.total,
    'total_nuevo',       v_total,
    'diferencia_total',  v_total - v_venta.total,
    'recargo_nuevo',     v_recargo
  );
end;
$$;

comment on function public.corregir_metodo_pago_venta(uuid, uuid, text) is
  'Cambia el método de pago de una venta de UN solo cobro cuyo turno sigue '
  'abierto, recalculando recargo, comisión y total, y dejando la corrección en '
  'ventas_correcciones. SECURITY DEFINER con los chequeos de negocio, permiso '
  'y pertenencia escritos adentro: la policy de UPDATE de ventas exige '
  'ventas.anular, que es justo el permiso que esta operación no necesita. '
  'Ver 20260903130000.';

revoke all on function public.corregir_metodo_pago_venta(uuid, uuid, text) from public;
grant execute on function public.corregir_metodo_pago_venta(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.permisos where clave = 'ventas.corregir_pago') then
    raise exception 'No se creó el permiso ventas.corregir_pago.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ventas_correcciones'
       and policyname = 'aislamiento_negocio'
  ) then
    raise exception 'ventas_correcciones quedó sin policy de aislamiento.';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ventas_correcciones'
       and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'ventas_correcciones no puede tener policy de UPDATE ni DELETE: es append-only.';
  end if;
end $$;

commit;
