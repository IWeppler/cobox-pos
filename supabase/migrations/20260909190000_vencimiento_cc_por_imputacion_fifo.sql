-- ---------------------------------------------------------------------------
-- El vencimiento de cuenta corriente sale de imputar los pagos, y capital y
-- mora del mismo ticket se imputan como UNA SOLA DEUDA.
--
-- LO QUE PASABA. `recalcular_vencimiento_cc` no miraba los pagos: anclaba en
-- el débito más viejo POSTERIOR al último saldo cero. Una clienta que nunca
-- llega a cero arrastra el ancla del primer fiado de su vida para siempre, por
-- más que haya pagado esa compra entera y a tiempo.
--
-- EL CASO (Angi Levis, Estilo Bonito, 9/9/2026):
--
--   17/08 15:01  DEBITO   50.000     saldo  50.000
--   05/09 14:17  CREDITO  40.000     saldo  10.000
--   05/09 21:01  DEBITO  122.000     saldo 132.000
--   07/09 15:13  CREDITO  69.500     saldo  62.500
--
-- El pago del 07/09 cubre los 10.000 que quedaban del 17/08 —dejándolo
-- saldado— y 59.500 del 05/09. Lo único vivo son 62.500 de la compra del
-- 05/09, así que su vencimiento es el 06/10. El sistema mostraba el 17/09.
--
-- LA IMPUTACIÓN NO SE INVENTA ACÁ. `deuda_cc_vencida` ya imputa FIFO con la
-- misma expresión (`least(monto, acumulado - pagado)`). Eran dos funciones
-- contestando la misma pregunta con reglas distintas; esta pasa a usar la de
-- la otra. Es el mismo patrón de los incidentes de `sesion-interrumpida.ts` y
-- del claim del token: dos fuentes que se contradicen.
--
-- LA UNIDAD DE DEUDA ES EL TICKET CON SU RECARGO ADENTRO, y esto es lo que
-- pidió la dueña con todas las letras: cuando una clienta paga, paga su compra
-- más vieja COMPLETA, con el recargo que esa compra generó incluido. Recién
-- ahí esa deuda queda saldada, el recargo se va con ella y el vencimiento pasa
-- a la compra siguiente.
--
-- El vínculo lo da `debito_origen_id` (20260909180000). Consecuencias que
-- valen la pena escribir porque no son obvias:
--
--   * Un ticket con recargo impago SIGUE VIVO Y VIEJO aunque su capital esté
--     pagado. No hace falta ninguna regla extra de "mora viva = vencida": la
--     unidad se sostiene sola.
--   * Un pago parcial no salda nada ni corre ninguna fecha. Sobre un ticket de
--     13.000 (10.000 + 3.000 de recargo), pagar 12.999 lo deja vivo con su
--     fecha original.
--   * Un recargo que entra DESPUÉS de que el capital se pagó revive ese
--     ticket, con su fecha vieja. No está saldado hasta que se pague todo.
--
-- EL RECARGO HUÉRFANO (`debito_origen_id` null) es el único caso que necesita
-- regla aparte: no tiene ticket que lo sostenga en la cola, y con su propia
-- fecha —la del día en que se cobró— le abriría a la clienta un plazo nuevo
-- entero debiendo recargo. Mientras haya, el vencimiento es esa fecha SIN
-- sumarle el plazo: ese día la cuenta ya estaba vencida, que es justamente por
-- lo que se cobró. Hoy son CERO —los 39 recargos quedaron vinculados y los
-- nuevos nacen declarados— pero la puerta queda cerrada.
--
-- LO QUE CUESTA, medido el 9/9/2026 sobre las 120 clientas con saldo:
--   * 8 cambian de fecha de vencimiento.
--   * 5 pasan de vencidas a al día, $191.556: Magui araya, CELESTE SCHOFER,
--     IVANA JEREZ, MICAELA ACOSTA y Remisería La Estrella. Confirmado con la
--     dueña, incluido el caso de CELESTE, que sale de mora por $26,25 de
--     recargo ya saldado dentro de su ticket viejo.
--   * 0 pasan de al día a vencidas.
--   * Vero duarte sigue vencida (08/09). Es el caso que fijó el criterio del
--     5/9 y aguanta.
--   * El saldo reconcilia al peso con `clientes.saldo_pendiente` en las 8: la
--     imputación cambia QUÉ está vivo, nunca CUÁNTO se debe.
--
-- El espejo en TypeScript es `features/clients/lib/imputar-pagos-fifo.ts`
-- (41 tests) y los dos tienen que decir lo mismo, mismo criterio que
-- `temporada-categoria.ts` contra `categoria_en_temporada`.
-- ---------------------------------------------------------------------------

create or replace function public.recalcular_vencimiento_cc(p_cliente_id uuid)
returns date
language sql
stable
set search_path to 'public', 'security', 'pg_temp'
as $function$
  with plazo as (
    select coalesce(cp.cc_plazo_mora, 30) as dias
    from public.clientes c
    left join public.configuracion_pos cp on cp.negocio_id = c.negocio_id
    where c.id = p_cliente_id
  ),
  -- Cuánto recargo cuelga de cada ticket.
  mora_por_ticket as (
    select m.debito_origen_id as ticket_id, sum(m.monto) as mora
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.tipo = 'DEBITO'
      and m.anulado = false
      and m.pago_id is not null
      and m.debito_origen_id is not null
    group by m.debito_origen_id
  ),
  -- Las UNIDADES de deuda: cada compra con su recargo adentro, más los
  -- recargos huérfanos como unidad propia.
  unidades as (
    select
      coalesce(d.fecha_origen, (d.creado_en at time zone 'UTC')::date) as fecha,
      d.creado_en,
      d.monto + coalesce(mt.mora, 0) as total,
      false as es_mora_huerfana
    from public.cuenta_corriente_movimientos d
    left join mora_por_ticket mt on mt.ticket_id = d.id
    where d.cliente_id = p_cliente_id
      and d.tipo = 'DEBITO'
      and d.anulado = false
      and d.pago_id is null

    union all

    select
      coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date),
      m.creado_en,
      m.monto,
      true
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.tipo = 'DEBITO'
      and m.anulado = false
      and m.pago_id is not null
      and m.debito_origen_id is null
  ),
  -- `creado_en` desempata las del mismo día: en la cuenta de Angi el pago y la
  -- compra del 05/09 están separados por horas y ordenarlas al revés da otra
  -- respuesta.
  ordenadas as (
    select
      u.*,
      sum(u.total) over (
        order by u.fecha, u.creado_en
        rows unbounded preceding
      ) as acumulado
    from unidades u
  ),
  pagado as (
    select coalesce(sum(m.monto), 0) as total
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.tipo = 'CREDITO'
      and m.anulado = false
  ),
  vivas as (
    select
      o.fecha,
      o.es_mora_huerfana,
      greatest(0, least(o.total, o.acumulado - pg.total)) as vivo
    from ordenadas o, pagado pg
  ),
  anclas as (
    select
      min(v.fecha) filter (where v.vivo > 0 and not v.es_mora_huerfana) as ticket,
      min(v.fecha) filter (where v.vivo > 0 and v.es_mora_huerfana)     as huerfana
    from vivas v
  )
  select
    case
      when a.ticket is null and a.huerfana is null then null
      when a.huerfana is null then a.ticket + pl.dias
      when a.ticket is null then a.huerfana
      -- Con las dos vivas gana la más exigente: la huérfana ya está vencida.
      else least(a.ticket + pl.dias, a.huerfana)
    end
  from anclas a, plazo pl;
$function$;

comment on function public.recalcular_vencimiento_cc(uuid) is
  'Vencimiento de cuenta corriente: plazo contado desde la deuda viva mas '
  'antigua, imputando los pagos FIFO y tratando cada ticket junto con el '
  'recargo por mora que genero (debito_origen_id) como una sola deuda. Un '
  'ticket con recargo impago sigue vivo y viejo aunque su capital este pagado. '
  'Un recargo huerfano devuelve su propia fecha, que ya esta vencida. '
  'Espejo de features/clients/lib/imputar-pagos-fifo.ts.';

-- Guard: las piezas sin las cuales esto vuelve a ser otra regla.
do $do$
declare
  v_def text;
  v_pieza text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'recalcular_vencimiento_cc';

  if v_def is null then
    raise exception 'recalcular_vencimiento_cc no existe';
  end if;

  foreach v_pieza in array array[
    'debito_origen_id',   -- capital y mora como una unidad
    'es_mora_huerfana',   -- y el recargo sin ticket, aparte
    'acumulado'           -- imputacion FIFO, no ciclo por saldo cero
  ]
  loop
    if position(v_pieza in v_def) = 0 then
      raise exception 'recalcular_vencimiento_cc quedo sin la pieza: %', v_pieza;
    end if;
  end loop;

  if position('saldo_tras' in v_def) > 0 then
    raise exception
      'recalcular_vencimiento_cc todavia ancla por ciclo (saldo_tras): la imputacion FIFO no quedo aplicada';
  end if;
end;
$do$;

-- Backfill del cache. `registrarPagoDeudaAction` lo escribe en cada
-- movimiento, asi que sin esto las clientas afectadas seguirian mostrando la
-- fecha vieja hasta su proximo pago — y la fecha vieja es la que dispara el
-- recargo.
update public.clientes c
set fecha_vencimiento_deuda = public.recalcular_vencimiento_cc(c.id)
where c.saldo_pendiente > 0
  and c.fecha_vencimiento_deuda is distinct from public.recalcular_vencimiento_cc(c.id);
