-- ---------------------------------------------------------------------------
-- Un recargo por mora tiene que decir de qué deuda es.
--
-- POR QUÉ NO LO DECÍA. El recargo se materializa como un DEBITO propio
-- (`registrarPagoDeudaAction`) con `pago_id` al cobro que lo generó y nada
-- más. No apunta a ninguna compra, y no podía: desde el 5/9/2026 se calcula
-- sobre TODO el capital adeudado (cláusula de aceleración), así que no nace de
-- un ticket sino del atraso de la cuenta entera.
--
-- POR QUÉ HACE FALTA IGUAL. La regla que pidió la dueña es que una clienta
-- paga su compra más vieja COMPLETA, con el recargo que esa compra generó
-- incluido: capital y mora son una sola unidad en la cola de imputación, no
-- dos deudas sueltas. Sin un vínculo, la mora es un débito huérfano que la
-- imputación FIFO manda al final por ser el más nuevo — y ahí un pago que
-- alcanzaba para saldar la deuda vieja entera deja la cuenta vencida por el
-- recargo.
--
-- LA ATRIBUCIÓN, y que quede claro que es RECONSTRUIDA. El vínculo se deduce:
-- cada recargo se atribuye al ticket de CAPITAL vivo más antiguo en el
-- instante en que se cobró, imputando los pagos FIFO con el ledger de ese
-- momento. Ese ticket es el que disparó la mora, así que es el candidato
-- natural, y es un hecho derivable y verificable — no un reparto inventado.
-- Se descartó prorratear el recargo entre los tickets vivos: sería repartir un
-- número que nadie repartió.
--
-- Pero es una deducción, no una declaración, y eso NO se puede borrar después.
-- Por eso `origen_reconstruido` queda para siempre y no solo durante la
-- migración: si mañana alguien audita por qué el recargo de MIRTA GARCIA
-- cuelga de un débito de febrero, la fila tiene que poder contestar "porque lo
-- dedujo el backfill del 9/9/2026", no hacerse pasar por un dato que se cargó
-- al cobrar.
--
-- LOS 39 QUE YA ESTÁN COBRADOS resuelven todos: cero quedan en NULL. Revisado
-- fila por fila antes de escribir esta migración. Casos que conviene conocer:
--   * La mayoría apunta a "Saldo inicial importado (CSV)" o "pre-sistema", no
--     a una venta del POS: son deudas anteriores al sistema, así que el
--     vínculo NO va a llevar a un `ventas.id` (esos débitos tienen venta_id
--     null). Es correcto, no es un vínculo roto.
--   * MIRTA GARCIA apunta a un débito del 07/02/2026 — la misma deuda que
--     estuvo 176 días mostrándose al día.
--   * El más grande es MARIANELA BARRETO: $32.760 sobre un ticket de $157.450.
--
-- NULL significa "no se sabe", nunca "es del primero". Si un recargo no tiene
-- capital vivo anterior, queda sin vínculo y la imputación lo tratará como
-- deuda suelta.
--
-- DE ACÁ EN ADELANTE el vínculo se DECLARA, no se deduce: `deuda_cc_vencida`
-- pasa a devolver el id del débito de capital vivo más antiguo para que
-- `registrarPagoDeudaAction` lo escriba al cobrar. Sin eso, cada recargo nuevo
-- nacería en NULL y haría falta otro backfill dentro de un mes.
-- ---------------------------------------------------------------------------

alter table public.cuenta_corriente_movimientos
  add column if not exists debito_origen_id uuid,
  add column if not exists origen_reconstruido boolean not null default false;

-- Sin FK dura, mismo criterio que `ventas_items.variante_id` y que
-- `producto_variantes_auditoria`: el historial tiene que sobrevivir a que la
-- fila apuntada desaparezca. El ledger no borra (usa `anulado`), pero la regla
-- vale igual — un vínculo roto es peor que un vínculo sin FK.
comment on column public.cuenta_corriente_movimientos.debito_origen_id is
  'Solo en filas de recargo por mora: el DEBITO de capital al que pertenece '
  'ese recargo. Capital y mora del mismo ticket se imputan como una unidad. '
  'NULL = no se sabe (nunca "es del primero").';

comment on column public.cuenta_corriente_movimientos.origen_reconstruido is
  'true = el vinculo lo dedujo el backfill del 9/9/2026 a partir del ledger, '
  'no se declaro al cobrar. Queda para siempre: una deduccion no puede '
  'hacerse pasar por un dato cargado.';

-- Solo un recargo puede tener origen. Un DEBITO de mercaderia o un CREDITO con
-- `debito_origen_id` seria una fila que nadie sabe interpretar.
alter table public.cuenta_corriente_movimientos
  drop constraint if exists cc_mov_origen_solo_en_mora;

alter table public.cuenta_corriente_movimientos
  add constraint cc_mov_origen_solo_en_mora check (
    debito_origen_id is null
    or (tipo = 'DEBITO' and pago_id is not null)
  );

-- Y un recargo no puede colgar de sí mismo ni de otro recargo: la unidad es
-- capital + su mora, nunca mora sobre mora.
alter table public.cuenta_corriente_movimientos
  drop constraint if exists cc_mov_origen_no_es_si_mismo;

alter table public.cuenta_corriente_movimientos
  add constraint cc_mov_origen_no_es_si_mismo check (
    debito_origen_id is null or debito_origen_id <> id
  );

create index if not exists idx_cc_mov_debito_origen
  on public.cuenta_corriente_movimientos (debito_origen_id)
  where debito_origen_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill de los 39 ya cobrados. Es la MISMA consulta que se revisó en
-- solo lectura, sin una coma de diferencia.
-- ---------------------------------------------------------------------------
with mora as (
  select m.id as mora_id, m.cliente_id, m.creado_en
  from public.cuenta_corriente_movimientos m
  where m.tipo = 'DEBITO' and m.pago_id is not null and m.anulado = false
),
deb_previos as (
  select
    mo.mora_id,
    x.id as debito_id,
    coalesce(x.fecha_origen, (x.creado_en at time zone 'UTC')::date) as fecha,
    x.creado_en,
    x.monto,
    x.pago_id is not null as es_mora,
    sum(x.monto) over (
      partition by mo.mora_id
      order by coalesce(x.fecha_origen, (x.creado_en at time zone 'UTC')::date), x.creado_en
      rows unbounded preceding
    ) as acum
  from mora mo
  join public.cuenta_corriente_movimientos x
    on x.cliente_id = mo.cliente_id
   and x.anulado = false
   and x.tipo = 'DEBITO'
   and x.creado_en < mo.creado_en
),
cred_previos as (
  select mo.mora_id, coalesce(sum(x.monto), 0) as pagado
  from mora mo
  left join public.cuenta_corriente_movimientos x
    on x.cliente_id = mo.cliente_id
   and x.anulado = false
   and x.tipo = 'CREDITO'
   and x.creado_en < mo.creado_en
  group by mo.mora_id
),
atribucion as (
  select distinct on (d.mora_id) d.mora_id, d.debito_id
  from deb_previos d
  join cred_previos c on c.mora_id = d.mora_id
  where greatest(0, least(d.monto, d.acum - c.pagado)) > 0
    and not d.es_mora
  order by d.mora_id, d.fecha, d.creado_en
)
update public.cuenta_corriente_movimientos m
set debito_origen_id = a.debito_id,
    origen_reconstruido = true
from atribucion a
where m.id = a.mora_id
  and m.debito_origen_id is null;

-- ---------------------------------------------------------------------------
-- Y para que los recargos NUEVOS nazcan con el vinculo declarado: la funcion
-- devuelve el id del debito de capital vivo mas antiguo, que es el mismo que
-- ya usa como `fecha_mas_antigua`.
-- ---------------------------------------------------------------------------
drop function if exists public.deuda_cc_vencida(uuid);

create function public.deuda_cc_vencida(p_cliente_id uuid default null)
returns table (
  cliente_id uuid,
  saldo_vivo numeric,
  vencido numeric,
  fecha_mas_antigua date,
  mora_viva numeric,
  capital_vivo numeric,
  -- El ticket al que pertenece el proximo recargo. Se devuelve para que el
  -- cobro lo DECLARE en vez de que haya que deducirlo despues.
  debito_capital_mas_antiguo_id uuid
)
language sql
stable
set search_path to 'public', 'security', 'pg_temp'
as $function$
  with plazos as (
    select c.id as cliente_id, coalesce(cp.cc_plazo_mora, 30) as dias
    from public.clientes c
    left join public.configuracion_pos cp on cp.negocio_id = c.negocio_id
    where p_cliente_id is null or c.id = p_cliente_id
  ),
  debitos as (
    select
      m.cliente_id,
      m.id as debito_id,
      coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date) as fecha,
      m.monto,
      m.creado_en,
      m.pago_id is not null as es_mora,
      sum(m.monto) over (
        partition by m.cliente_id
        order by coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date), m.creado_en
        rows unbounded preceding
      ) as acumulado
    from public.cuenta_corriente_movimientos m
    join plazos p on p.cliente_id = m.cliente_id
    where m.tipo = 'DEBITO'
      and m.anulado = false
  ),
  pagado as (
    select m.cliente_id, coalesce(sum(m.monto), 0) as total
    from public.cuenta_corriente_movimientos m
    join plazos p on p.cliente_id = m.cliente_id
    where m.tipo = 'CREDITO'
      and m.anulado = false
    group by m.cliente_id
  ),
  vivos as (
    select
      d.cliente_id,
      d.debito_id,
      d.fecha,
      d.creado_en,
      d.es_mora,
      greatest(0, least(d.monto, d.acumulado - coalesce(pg.total, 0))) as vivo,
      pl.dias
    from debitos d
    join plazos pl on pl.cliente_id = d.cliente_id
    left join pagado pg on pg.cliente_id = d.cliente_id
  ),
  ancla as (
    select distinct on (v.cliente_id) v.cliente_id, v.debito_id
    from vivos v
    where v.vivo > 0 and not v.es_mora
    order by v.cliente_id, v.fecha, v.creado_en
  )
  select
    v.cliente_id,
    round(sum(v.vivo), 2) as saldo_vivo,
    round(sum(v.vivo) filter (
      where v.vivo > 0 and v.fecha + v.dias < current_date
    ), 2) as vencido,
    min(v.fecha) filter (where v.vivo > 0) as fecha_mas_antigua,
    round(coalesce(sum(v.vivo) filter (where v.es_mora), 0), 2) as mora_viva,
    round(coalesce(sum(v.vivo) filter (where not v.es_mora), 0), 2) as capital_vivo,
    -- Va en el GROUP BY y no en un agregado: `ancla` ya es una fila por
    -- cliente, y Postgres no tiene max(uuid).
    a.debito_id as debito_capital_mas_antiguo_id
  from vivos v
  left join ancla a on a.cliente_id = v.cliente_id
  group by v.cliente_id, a.debito_id
  having sum(v.vivo) > 0;
$function$;

comment on function public.deuda_cc_vencida(uuid) is
  'Deuda viva por cliente imputando los pagos FIFO. `capital_vivo` es la base '
  'del recargo por mora: excluye los DEBITO que son recargos previos '
  '(pago_id no nulo), para que la mora no se calcule sobre mora. '
  '`debito_capital_mas_antiguo_id` es el ticket al que pertenece el proximo '
  'recargo, para que el cobro lo declare. `vencido` se sigue devolviendo como '
  'informacion pero no es la base del cobro desde el 5/9/2026.';

grant execute on function public.deuda_cc_vencida(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guards. El backfill se revisó a mano sobre 39 filas; estos frenos son para
-- que el resultado no quede a merced de un error de tipeo en el UPDATE.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_sin_vinculo integer;
  v_total integer;
  v_mal_apuntados integer;
  v_def text;
begin
  select count(*) into v_total
  from public.cuenta_corriente_movimientos
  where tipo = 'DEBITO' and pago_id is not null and anulado = false;

  select count(*) into v_sin_vinculo
  from public.cuenta_corriente_movimientos
  where tipo = 'DEBITO' and pago_id is not null and anulado = false
    and debito_origen_id is null;

  -- Los 39 revisados resolvían todos. Si aparece alguno sin vínculo, el
  -- backfill no hizo lo que se revisó y hay que mirarlo antes de seguir.
  if v_sin_vinculo > 0 then
    raise exception
      'El backfill dejo % de % recargos sin vinculo; se reviso un listado donde resolvian todos',
      v_sin_vinculo, v_total;
  end if;

  -- Ningun recargo puede colgar de otro recargo: eso seria mora sobre mora
  -- entrando por la puerta de atras.
  select count(*) into v_mal_apuntados
  from public.cuenta_corriente_movimientos m
  join public.cuenta_corriente_movimientos o on o.id = m.debito_origen_id
  where m.debito_origen_id is not null
    and o.pago_id is not null;

  if v_mal_apuntados > 0 then
    raise exception 'Hay % recargos apuntando a otro recargo', v_mal_apuntados;
  end if;

  -- Y el vinculo tiene que ser del MISMO cliente.
  select count(*) into v_mal_apuntados
  from public.cuenta_corriente_movimientos m
  join public.cuenta_corriente_movimientos o on o.id = m.debito_origen_id
  where m.debito_origen_id is not null
    and o.cliente_id <> m.cliente_id;

  if v_mal_apuntados > 0 then
    raise exception 'Hay % recargos apuntando al ticket de otro cliente', v_mal_apuntados;
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'deuda_cc_vencida';

  if position('debito_capital_mas_antiguo_id' in v_def) = 0
     or position('capital_vivo' in v_def) = 0 then
    raise exception 'deuda_cc_vencida quedo sin las columnas que necesita el cobro';
  end if;
end;
$do$;
