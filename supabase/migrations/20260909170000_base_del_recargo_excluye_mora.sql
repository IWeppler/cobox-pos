-- ---------------------------------------------------------------------------
-- La base del recargo por mora no puede incluir recargos anteriores.
--
-- LO QUE PROMETE LA PANTALLA. Configuración > Clientes dice, con todas las
-- letras, que el recargo "se suma una única vez ... no se acumula día a día".
-- Hasta hoy eso lo cumplía la aritmética por casualidad: el recargo se
-- calculaba sobre `monto_pendiente`, que era capital, así que recalcularlo dos
-- veces daba lo mismo.
--
-- LO QUE LO ROMPIÓ. Desde `20260823...` el recargo se MATERIALIZA como un
-- DEBITO propio (`registrarPagoDeudaAction`), y un débito entra al saldo. Y
-- desde el 5/9/2026 la base del recargo es el SALDO COMPLETO. Las dos
-- decisiones son buenas por separado; juntas hacen que el segundo recargo de
-- una clienta se calcule sobre un saldo que ya contiene el primero. Interés
-- compuesto, contra lo que promete la pantalla.
--
-- NO PASÓ TODAVÍA: verificado el 9/9/2026, ninguna clienta de los 4 negocios
-- tiene un segundo recargo (39 filas de mora, todas primeras). Pero no hace
-- falta ningún cambio para que se dispare: alcanza con que una pague parcial y
-- se vuelva a atrasar. Por eso esto entra solo y antes que el resto del
-- trabajo de imputación: es corrección de algo que ya está mal en producción.
--
-- LA REGLA: la base del recargo es el CAPITAL adeudado. Nunca los recargos
-- previos. Esto NO revierte la decisión del 5/9 —la base sigue siendo todo el
-- capital, vencido o no, que es la cláusula de aceleración— solo le saca de
-- adentro lo que no es mercadería.
--
-- CÓMO SE RECONOCE UNA MORA: por ESTRUCTURA. Un DEBITO con `pago_id` es
-- siempre un recargo (lo inserta el cobro que lo generó); ningún otro DEBITO
-- tiene `pago_id`. Verificado sobre las 437 filas vivas: 39 DEBITO con
-- pago_id, los 39 con "mora" en la descripción; 253 con venta_id y 145
-- manuales, ninguno. Matchear la descripción andaría hoy y se rompería el día
-- que alguien escriba "mora" en un ajuste a mano.
--
-- La función se DROPEA y se recrea porque cambia su RETURNS TABLE. Verificado
-- que ninguna otra función de la base la usa; sus únicos consumidores son
-- cuatro llamadas desde TypeScript, que toleran una columna nueva.
-- ---------------------------------------------------------------------------

drop function if exists public.deuda_cc_vencida(uuid);

create function public.deuda_cc_vencida(p_cliente_id uuid default null)
returns table (
  cliente_id uuid,
  saldo_vivo numeric,
  vencido numeric,
  fecha_mas_antigua date,
  -- Nuevas. `mora_viva` es lo que hay que sacarle a la base del recargo;
  -- `capital_vivo` es esa base ya resuelta, para que ningún llamador tenga que
  -- volver a restar y equivocarse en el signo.
  mora_viva numeric,
  capital_vivo numeric
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
      d.fecha,
      d.es_mora,
      greatest(
        0,
        least(d.monto, d.acumulado - coalesce(pg.total, 0))
      ) as vivo,
      pl.dias
    from debitos d
    join plazos pl on pl.cliente_id = d.cliente_id
    left join pagado pg on pg.cliente_id = d.cliente_id
  )
  select
    v.cliente_id,
    round(sum(v.vivo), 2) as saldo_vivo,
    round(sum(v.vivo) filter (
      where v.vivo > 0 and v.fecha + v.dias < current_date
    ), 2) as vencido,
    min(v.fecha) filter (where v.vivo > 0) as fecha_mas_antigua,
    round(coalesce(sum(v.vivo) filter (where v.es_mora), 0), 2) as mora_viva,
    round(coalesce(sum(v.vivo) filter (where not v.es_mora), 0), 2) as capital_vivo
  from vivos v
  group by v.cliente_id
  having sum(v.vivo) > 0;
$function$;

comment on function public.deuda_cc_vencida(uuid) is
  'Deuda viva por cliente imputando los pagos FIFO. `capital_vivo` es la base '
  'del recargo por mora: excluye los DEBITO que son recargos previos '
  '(pago_id no nulo), para que la mora no se calcule sobre mora. '
  '`vencido` se sigue devolviendo como informacion (antiguedad, Advisor) '
  'pero no es la base del cobro desde el 5/9/2026.';

grant execute on function public.deuda_cc_vencida(uuid) to authenticated;

-- Guard: sin el corte por `es_mora` la funcion vuelve a devolver una base que
-- incluye recargos, y el interes compuesto vuelve sin que nadie lo note.
do $do$
declare
  v_def text;
  v_pieza text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'deuda_cc_vencida';

  if v_def is null then
    raise exception 'deuda_cc_vencida no existe';
  end if;

  foreach v_pieza in array array[
    'es_mora',
    'pago_id is not null',
    'capital_vivo',
    'mora_viva'
  ]
  loop
    if position(v_pieza in v_def) = 0 then
      raise exception 'deuda_cc_vencida quedo sin la pieza: %', v_pieza;
    end if;
  end loop;
end;
$do$;
