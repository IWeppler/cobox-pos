-- ===========================================================================
-- 3. `antiguedad_saldo_cc`: cuán vieja es la plata que le deben.
--
-- Es el sustituto honesto de la incobrabilidad: con 5 semanas de historia
-- nada es incobrable todavía, pero la antigüedad SÍ es un hecho, y es la
-- que dispara la acción de cobrar.
--
-- EL SUPUESTO, y hay que decirlo en la UI: los pagos de cuenta corriente no
-- están imputados a una venta —la base no sabe qué ticket saldó cada pago— así
-- que para saber QUÉ deuda sigue viva hay que imputar. Se usa FIFO: los pagos
-- cancelan las deudas más viejas primero. Es lo que hace cualquier reporte de
-- antigüedad y es lo que asume el propio cliente cuando paga, pero es un
-- supuesto y no un dato. La salida lo declara en `imputacion`.
--
-- `clientes_descuadrados` es el control de calidad de la propia señal: cuenta
-- los clientes donde el libro (Σ débitos − Σ créditos) no coincide con
-- `clientes.saldo_pendiente`. Medido antes de escribir esto: 154 de 156
-- coinciden, 2 difieren, $32.200 en total. Si ese número crece, la antigüedad
-- deja de ser confiable y la tarjeta tiene que avisarlo en vez de mostrar
-- números que no cierran contra el saldo que ve la dueña.
-- ===========================================================================
create or replace function public.antiguedad_saldo_cc(
  p_limite int default 15
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  v_negocio uuid;
  v_hoy     date;
  v_limite  int := greatest(1, least(coalesce(p_limite, 15), 100));
  v_out     jsonb;
begin
  if not public.tiene_permiso('caja.ver_gerencial') then
    raise exception 'No tenés permiso para ver la antigüedad de la deuda'
      using errcode = '42501';
  end if;

  v_negocio := security.current_negocio_id();
  if v_negocio is null then
    raise exception 'No hay un negocio activo' using errcode = '42501';
  end if;

  v_hoy := (now() at time zone v_tz)::date;

  with mov as (
    select cliente_id, tipo, monto, creado_en
      from public.cuenta_corriente_movimientos
     where negocio_id = v_negocio
       and coalesce(anulado, false) = false
       and cliente_id is not null
  ),
  creditos as (
    select cliente_id, sum(monto) as pagado
      from mov where tipo = 'CREDITO' group by cliente_id
  ),
  debitos as (
    select
      d.cliente_id,
      d.monto,
      (d.creado_en at time zone v_tz)::date as fecha,
      -- Acumulado de deuda desde la más vieja: con el total pagado alcanza
      -- para saber hasta dónde llegaron los pagos.
      sum(d.monto) over (
        partition by d.cliente_id order by d.creado_en
        rows between unbounded preceding and current row
      ) as acumulado
    from mov d
    where d.tipo = 'DEBITO'
  ),
  -- Lo que queda vivo de cada débito después de aplicar los pagos FIFO.
  vivo as (
    select
      d.cliente_id,
      d.fecha,
      greatest(0, least(d.monto, d.acumulado - coalesce(c.pagado, 0))) as saldo,
      (v_hoy - d.fecha) as dias
    from debitos d
    left join creditos c on c.cliente_id = d.cliente_id
  ),
  vivos as (select * from vivo where saldo > 0.05),
  tramos as (
    select
      case when dias <= 30 then '0_30' when dias <= 60 then '31_60'
           when dias <= 90 then '61_90' else 'MAS_90' end as tramo,
      case when dias <= 30 then 1 when dias <= 60 then 2
           when dias <= 90 then 3 else 4 end as orden,
      sum(saldo) as saldo,
      count(distinct cliente_id) as clientes
    from vivos group by 1, 2
  ),
  por_cliente as (
    select
      v.cliente_id,
      coalesce(cl.nombre, 'Cliente eliminado') as cliente,
      cl.telefono,
      sum(v.saldo)  as saldo,
      max(v.dias)   as dias_mas_viejo
    from vivos v
    left join public.clientes cl on cl.id = v.cliente_id
    group by v.cliente_id, cl.nombre, cl.telefono
  ),
  descuadre as (
    select count(*) as clientes
    from public.clientes cl
    left join (
      select cliente_id,
             sum(case when tipo = 'DEBITO' then monto else -monto end) as libro
      from mov group by cliente_id
    ) l on l.cliente_id = cl.id
    where cl.negocio_id = v_negocio
      and (coalesce(cl.saldo_pendiente, 0) > 0 or l.libro is not null)
      and abs(coalesce(l.libro, 0) - coalesce(cl.saldo_pendiente, 0)) > 1
  )
  select jsonb_build_object(
    'generado_en', now(),
    'hoy', v_hoy,
    -- El supuesto, explícito y en la respuesta: no se puede leer la señal sin
    -- verlo.
    'imputacion', 'FIFO: los pagos cancelan las deudas más viejas primero. Los pagos de cuenta corriente no están imputados a una venta, así que esto es un supuesto, no un dato.',
    'total_vivo', (select round(coalesce(sum(saldo), 0), 2) from vivos),
    'clientes_con_deuda', (select count(*) from por_cliente),
    -- Control de calidad de la propia señal. Con > 0, el libro y el saldo
    -- dicen cosas distintas para alguien y la antigüedad no cierra contra lo
    -- que ve la dueña.
    'clientes_descuadrados', (select clientes from descuadre),
    'tramos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tramo', tramo,
        'saldo', round(saldo, 2),
        'clientes', clientes,
        'pct', round(saldo * 100.0 / nullif((select sum(saldo) from vivos), 0), 2)
      ) order by orden), '[]'::jsonb)
      from tramos
    ),
    'peores_deudores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cliente', cliente,
        'telefono', telefono,
        'saldo', round(saldo, 2),
        'dias_mas_viejo', dias_mas_viejo
      ) order by saldo desc), '[]'::jsonb)
      from (select * from por_cliente order by saldo desc limit v_limite) x
    ),
    'mas_antiguos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cliente', cliente,
        'telefono', telefono,
        'saldo', round(saldo, 2),
        'dias_mas_viejo', dias_mas_viejo
      ) order by dias_mas_viejo desc), '[]'::jsonb)
      from (select * from por_cliente order by dias_mas_viejo desc limit v_limite) x
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.antiguedad_saldo_cc(int) from public;
grant execute on function public.antiguedad_saldo_cc(int) to authenticated;

comment on function public.antiguedad_saldo_cc(int) is
  'Comerz Insights: antigüedad del saldo de cuenta corriente por tramo y por cliente. Sustituto honesto de la incobrabilidad, que con 5 semanas de historia no se puede calcular. Imputa FIFO y lo declara. Gate: caja.ver_gerencial.';
