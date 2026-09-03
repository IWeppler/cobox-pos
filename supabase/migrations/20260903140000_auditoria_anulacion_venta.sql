-- Auditoría de la anulación: quién, cuándo y por qué.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE FALTABA
--
-- `ventas` no tenía forma de decir quién anuló una venta ni cuándo. La única
-- manera de fecharlo era reconstruirlo desde los efectos: la fila de `egresos`
-- que deja la devolución en efectivo, o la de `movimientos_stock` del stock
-- restaurado. Medido sobre las 26 anulaciones de Evens: 21 tienen rastro por
-- el egreso, 6 por movimientos de stock y 2 no tienen ninguno — o sea que hay
-- ventas de las que se sabe que están anuladas y no cuándo ni por quién.
--
-- Y la columna que se llama "motivo" nunca guardó un motivo: `motivo_anulacion`
-- tiene `RESTAURAR_STOCK` o `BAJA`, que es el DESTINO de la mercadería. Las 26
-- anulaciones de Evens son 20 RESTAURAR_STOCK, 0 BAJA y 6 en null. La pregunta
-- "¿por qué se cayó esta venta?" no tenía dónde responderse.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ COLUMNAS Y NO UNA FILA EN `ventas_correcciones`
--
-- Porque una venta se anula UNA sola vez y el estado es terminal: el guard de
-- `anular_venta` es un UPDATE condicional sobre `estado_operacion <> 'ANULADA'`
-- que no deja pasar la segunda. No hay secuencia que registrar, que es
-- justamente lo que hace falta con las correcciones (una venta puede
-- corregirse varias veces y lo que importa es el orden). Además "cuántas anuló
-- cada vendedora este mes" se contesta sin join.
--
-- ───────────────────────────────────────────────────────────────────────────
-- ADITIVA A PROPÓSITO: `motivo_anulacion` NO CAMBIA DE SIGNIFICADO
--
-- Lo natural sería reciclar esa columna para el motivo de verdad. No se hace,
-- y el motivo es de despliegue: la migración se aplica ANTES de que el código
-- nuevo esté arriba, así que entre las dos cosas el código viejo sigue
-- escribiendo 'RESTAURAR_STOCK' ahí. Con un CHECK nuevo que no lo acepte,
-- TODAS las anulaciones fallarían durante la ventana de deploy — en la pantalla
-- que devuelve plata en el mostrador.
--
-- Entonces la columna vieja se queda como está y se sigue escribiendo en
-- paralelo, con un COMMENT que dice qué es y qué leer en su lugar. Sacarla es
-- otra migración, después de que el código nuevo esté arriba y estable.

begin;

-- ---------------------------------------------------------------------------
-- 1. Las columnas
-- ---------------------------------------------------------------------------
alter table public.ventas
  add column if not exists anulada_por        uuid,
  add column if not exists anulada_en         timestamptz,
  add column if not exists destino_mercaderia text,
  add column if not exists motivo_codigo      text,
  add column if not exists motivo_detalle     text;

-- Los CHECK son fail-closed y NOT VALID no hace falta: las columnas nacen
-- vacías y el backfill de abajo solo escribe valores válidos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventas'::regclass
       and conname = 'ventas_destino_mercaderia_check'
  ) then
    alter table public.ventas
      add constraint ventas_destino_mercaderia_check
      check (destino_mercaderia is null
             or destino_mercaderia in ('RESTAURAR_STOCK', 'BAJA'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventas'::regclass
       and conname = 'ventas_motivo_codigo_check'
  ) then
    -- Misma lista que `features/sales/lib/motivo-anulacion.ts`. Los dos tienen
    -- que decir lo mismo: agregar un motivo es tocar los dos lados.
    alter table public.ventas
      add constraint ventas_motivo_codigo_check
      check (motivo_codigo is null
             or motivo_codigo in ('ERROR_DE_CARGA', 'CAMBIO', 'ARREPENTIMIENTO',
                                  'FALLADO', 'OTRO'));
  end if;
end $$;

comment on column public.ventas.anulada_por is
  'Quién anuló la venta. Null en las anulaciones anteriores a esta columna que no dejaron egreso del que reconstruirlo.';

comment on column public.ventas.anulada_en is
  'Cuándo se anuló. Backfilleado desde egresos.fecha donde existía: ese egreso lo inserta la misma transacción que la anulación, así que es el momento exacto, no una estimación.';

comment on column public.ventas.destino_mercaderia is
  'A dónde fue la mercadería devuelta: RESTAURAR_STOCK o BAJA. Es lo que hasta ahora guardaba motivo_anulacion.';

comment on column public.ventas.motivo_codigo is
  'POR QUÉ se anuló, que es otra pregunta que a dónde fue la mercadería. Lista cerrada, ver features/sales/lib/motivo-anulacion.ts.';

comment on column public.ventas.motivo_anulacion is
  'DEPRECADA: guarda el destino de la mercadería (RESTAURAR_STOCK / BAJA), no un motivo. Se sigue escribiendo en paralelo para no romper el código desplegado. Leer destino_mercaderia.';

-- ---------------------------------------------------------------------------
-- 2. Backfill del destino: es una copia, no una interpretación
-- ---------------------------------------------------------------------------
update public.ventas
   set destino_mercaderia = motivo_anulacion
 where motivo_anulacion is not null
   and destino_mercaderia is null;

-- ---------------------------------------------------------------------------
-- 3. Backfill de quién y cuándo, SOLO desde el egreso
--
-- El egreso de devolución lo inserta `anular_venta` DENTRO de la misma
-- transacción que marca la venta, así que su `fecha` es el instante de la
-- anulación y su `creado_por` es quien la hizo. No es una aproximación.
--
-- `movimientos_stock` también tiene rastro y llega a 6 anulaciones más, pero
-- ESE se escribe después, en una llamada aparte, segundos más tarde y con el
-- usuario de esa llamada. Queda afuera: un timestamp cercano no es el
-- timestamp, y este proyecto ya decidió una vez que null ("no se sabe") es
-- mejor que un número inventado.
--
-- El match es por el prefijo del UUID que la función escribe en el concepto,
-- acotado al mismo negocio. Verificado antes de aplicar: los 957 prefijos de
-- venta son únicos dentro de su negocio, así que no hay forma de que una
-- anulación tome la fecha de otra. Los dos formatos de concepto conviven
-- ('Devolución Venta #X' el viejo, 'Devolucion en efectivo - Venta #X' el
-- actual), por eso el LIKE toma solo la cola.
-- ---------------------------------------------------------------------------
with rastro as (
  select v.id as venta_id,
         g.fecha,
         g.creado_por,
         row_number() over (partition by v.id order by g.fecha) as orden
    from public.ventas v
    join public.egresos g
      on g.negocio_id = v.negocio_id
     and g.concepto like '%Venta #' || upper(split_part(v.id::text, '-', 1))
   where v.estado_operacion = 'ANULADA'
)
update public.ventas v
   set anulada_en  = r.fecha,
       anulada_por = r.creado_por
  from rastro r
 where r.venta_id = v.id
   and r.orden = 1
   and v.anulada_en is null;

-- ---------------------------------------------------------------------------
-- 4. La función, con los campos nuevos
--
-- Se DROPEA y se recrea en vez de un `create or replace`: agregar parámetros
-- con default crea una firma nueva, y con las dos vivas una llamada de tres
-- argumentos matchea las dos y Postgres corta con "function is not unique".
-- Eso rompería la anulación entera. Drop y create en la misma transacción no
-- deja ventana.
--
-- Los parámetros nuevos van con default null, así que el código YA DESPLEGADO
-- —que llama con tres argumentos nombrados— sigue funcionando sin cambios y
-- deja los campos nuevos vacíos hasta que suba el código que los manda.
--
-- `p_motivo` conserva su nombre aunque lo que reciba sea el destino: es el
-- nombre que usa el cliente desplegado y renombrarlo ahí sí sería romper.
-- ---------------------------------------------------------------------------
drop function if exists public.anular_venta(uuid, text, uuid);

create function public.anular_venta(
  p_venta_id uuid,
  p_motivo text,
  p_turno_id uuid default null,
  p_motivo_codigo text default null,
  p_motivo_detalle text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, security, pg_temp
as $$
declare
  v_negocio uuid := security.current_negocio_id();
  v_cliente uuid;
  v_pendiente numeric;
  v_efectivo numeric;
  v_otros numeric;
  v_saldo numeric;
  v_credito numeric := 0;
  v_excedente numeric := 0;
  v_ticket text := upper(split_part(p_venta_id::text, '-', 1));
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  -- El guard va PRIMERO y es un UPDATE condicional, no un SELECT: toma el row
  -- lock que serializa dos anulaciones simultáneas. La segunda no encuentra
  -- fila y sale por 'VENTA_NO_ANULABLE' sin haber tocado nada.
  --
  -- Acá se escriben también los campos de auditoría. `motivo_anulacion` se
  -- sigue llenando con el destino por compatibilidad; el que hay que leer es
  -- `destino_mercaderia`.
  update public.ventas
     set estado_operacion   = 'ANULADA',
         estado_pago        = 'ANULADA',
         motivo_anulacion   = p_motivo,
         destino_mercaderia = p_motivo,
         motivo_codigo      = p_motivo_codigo,
         motivo_detalle     = nullif(btrim(coalesce(p_motivo_detalle, '')), ''),
         anulada_por        = auth.uid(),
         anulada_en         = now()
   where id = p_venta_id
     and estado_operacion <> 'ANULADA'
  returning cliente_id, coalesce(monto_pendiente, 0)
       into v_cliente, v_pendiente;

  if not found then
    raise exception 'VENTA_NO_ANULABLE';
  end if;

  update public.venta_pagos
     set estado_pago_operacion = 'ANULADO'
   where venta_id = p_venta_id;

  select
    coalesce(sum(monto_bruto) filter (where metodo_tipo = 'EFECTIVO'), 0),
    coalesce(sum(monto_bruto) filter (where metodo_tipo <> 'EFECTIVO'), 0)
    into v_efectivo, v_otros
  from public.venta_pagos
  where venta_id = p_venta_id;

  -- Solo el efectivo sale de la caja: lo cobrado por otros medios se devuelve
  -- por donde entró y el cajón no lo toca.
  if v_efectivo > 0 then
    insert into public.egresos (negocio_id, concepto, monto, creado_por, turno_caja_id)
    values (
      v_negocio,
      'Devolucion en efectivo - Venta #' || v_ticket,
      round(v_efectivo)::int,
      auth.uid(),
      p_turno_id
    );
  end if;

  if v_cliente is not null and v_pendiente > 0 then
    select coalesce(saldo_pendiente, 0) into v_saldo
      from public.clientes
     where id = v_cliente
       for update;

    if found then
      -- least(deuda de la venta, saldo vivo): la deuda congelada en la venta
      -- no baja con los pagos de cuenta corriente, así que usarla sola le
      -- perdonaría al cliente lo que ya pagó.
      v_credito := least(v_pendiente, greatest(v_saldo, 0));
      v_excedente := v_pendiente - v_credito;

      if v_credito > 0 then
        insert into public.cuenta_corriente_movimientos (
          negocio_id, cliente_id, venta_id, tipo, monto, descripcion, creado_por
        )
        values (
          v_negocio, v_cliente, p_venta_id, 'CREDITO', v_credito,
          'Anulacion de Venta #' || v_ticket, auth.uid()
        );

        update public.clientes
           set saldo_pendiente = greatest(0, coalesce(saldo_pendiente, 0) - v_credito)
         where id = v_cliente;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'efectivo_devuelto', v_efectivo,
    'no_efectivo_a_devolver', v_otros,
    'credito_aplicado', v_credito,
    'excedente_ya_pagado', v_excedente,
    'cliente_id', v_cliente
  );
end;
$$;

comment on function public.anular_venta(uuid, text, uuid, text, text) is
  'Anula una venta en UNA transacción: estado, auditoría (quién, cuándo, por '
  'qué y destino de la mercadería), cobros, egreso de caja por la porción en '
  'EFECTIVO y crédito de cuenta corriente acotado al saldo vivo. El stock y '
  'las unidades serializadas quedan afuera: son compensaciones y no pueden '
  'voltear la anulación. Ver 20260903140000.';

revoke all on function public.anular_venta(uuid, text, uuid, text, text) from public;
grant execute on function public.anular_venta(uuid, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_faltan int;
  v_sin_destino int;
begin
  select count(*) into v_faltan
    from (values ('anulada_por'), ('anulada_en'), ('destino_mercaderia'),
                 ('motivo_codigo'), ('motivo_detalle')) as t(col)
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ventas'
        and column_name = t.col
   );

  if v_faltan > 0 then
    raise exception 'Faltan % columnas de auditoría en ventas.', v_faltan;
  end if;

  -- Toda anulación que tenía destino en la columna vieja tiene que haberlo
  -- copiado. Si no, el backfill no corrió y `get-movimientos-stock` dejaría de
  -- ver las devoluciones al leer la columna nueva.
  select count(*) into v_sin_destino
    from public.ventas
   where motivo_anulacion is not null and destino_mercaderia is null;

  if v_sin_destino > 0 then
    raise exception 'Quedaron % ventas con motivo_anulacion sin copiar a destino_mercaderia.', v_sin_destino;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'anular_venta'
       and p.pronargs = 5
  ) then
    raise exception 'anular_venta no quedó con los 5 parámetros.';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'anular_venta') <> 1 then
    raise exception 'Quedó más de una versión de anular_venta: una llamada de 3 argumentos sería ambigua.';
  end if;
end $$;

commit;
