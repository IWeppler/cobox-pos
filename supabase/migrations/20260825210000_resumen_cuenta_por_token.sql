-- Resumen de cuenta corriente accesible por LINK.
--
-- Por qué un link y no un archivo: mandarle un PDF a una clienta desde el
-- celular son cinco pasos (descargar, abrir WhatsApp, buscar el contacto,
-- adjuntar, encontrar el archivo). Eso se hace una vez y se abandona. Un link
-- es un toque para la dueña y un toque para la clienta, y no depende de cuántos
-- movimientos tenga la cuenta.
--
-- El link NO es una foto congelada: muestra siempre el saldo actualizado. Si la
-- clienta paga y vuelve a abrirlo, ve que está al día. Eso también significa
-- que el token vive mientras exista el cliente; para cortar el acceso se
-- reemplaza el token (un update), y el link viejo deja de resolver.

alter table public.clientes
  add column if not exists resumen_token text;

comment on column public.clientes.resumen_token is
  'Token no adivinable para el link público del resumen de cuenta. Se genera '
  'la primera vez que se comparte. Reemplazarlo invalida los links anteriores.';

-- Único pero PARCIAL: la enorme mayoría de los clientes nunca comparte un
-- resumen y queda en null, y varios null no chocan entre sí.
create unique index if not exists clientes_resumen_token_key
  on public.clientes (resumen_token)
  where resumen_token is not null;

/**
 * El resumen completo de una cuenta corriente, resuelto por token.
 *
 * SECURITY DEFINER a propósito: la página es pública y anon no tiene ninguna
 * policy sobre `clientes` ni sobre `cuenta_corriente_movimientos`. El token ES
 * la credencial, así que la función no expone ninguna forma de listar ni de
 * adivinar: sin token válido devuelve null y nada más.
 *
 * Devuelve el saldo ANTERIOR al período y después los movimientos en orden con
 * su saldo corriente, que es lo que hace que el número cierre con lo que la
 * clienta recuerda. Los pagos van como renglones propios, no neteados contra
 * las compras.
 */
create or replace function public.resumen_cuenta_por_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz       constant text := 'America/Argentina/Buenos_Aires';
  -- Ventana del resumen. Un año cubre cualquier cuenta viva sin volver la
  -- página infinita; lo de antes se resume en una sola línea de saldo anterior.
  v_dias     constant int := 365;
  v_cliente  record;
  v_config   record;
  v_negocio  record;
  v_hoy      date;
  v_desde    date;
  v_out      jsonb;
begin
  -- Un token corto sería adivinable a fuerza bruta. Los que emite la app son
  -- de 32 caracteres; este piso corta cualquier intento de sondeo con basura.
  if p_token is null or length(p_token) < 24 then
    return null;
  end if;

  select c.* into v_cliente
  from public.clientes c
  where c.resumen_token = p_token;

  if not found then
    return null;
  end if;

  v_hoy := (now() at time zone v_tz)::date;
  v_desde := v_hoy - v_dias;

  select n.nombre into v_negocio
  from public.negocios n
  where n.id = v_cliente.negocio_id;

  select cp."posName", cp.direccion, cp.whatsapp into v_config
  from public.configuracion_pos cp
  where cp.negocio_id = v_cliente.negocio_id
  limit 1;

  with base as (
    select
      coalesce(m.fecha_origen, (m.creado_en at time zone v_tz)::date) as fecha,
      m.creado_en,
      m.tipo,
      m.monto,
      m.descripcion
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = v_cliente.id
      and m.anulado = false
  ),
  anterior as (
    select coalesce(
      sum(case when tipo = 'DEBITO' then monto else -monto end), 0
    ) as saldo
    from base
    where fecha < v_desde
  ),
  periodo as (
    select
      b.fecha,
      b.creado_en,
      b.tipo,
      b.monto,
      b.descripcion,
      (select saldo from anterior)
        + sum(case when b.tipo = 'DEBITO' then b.monto else -b.monto end)
          over (order by b.fecha, b.creado_en
                rows between unbounded preceding and current row) as saldo_corriente
    from base b
    where b.fecha >= v_desde
    order by b.fecha, b.creado_en
  )
  select jsonb_build_object(
    'comercio', jsonb_build_object(
      'nombre', coalesce(v_config."posName", v_negocio.nombre),
      'direccion', v_config.direccion,
      'whatsapp', v_config.whatsapp
    ),
    'cliente', jsonb_build_object(
      'nombre', v_cliente.nombre,
      'telefono', nullif(btrim(coalesce(v_cliente.telefono, '')), ''),
      'dni', nullif(btrim(coalesce(v_cliente.dni, '')), '')
    ),
    'desde', v_desde,
    'hasta', v_hoy,
    'emitido_en', now(),
    'saldo_anterior', round((select saldo from anterior), 2),
    -- El saldo que se cobra sale de la COLUMNA del cliente, no de la suma de
    -- los movimientos del período: es el mismo número que ve la dueña en la
    -- ficha y el que usa el cobro.
    'saldo_actual', round(coalesce(v_cliente.saldo_pendiente, 0), 2),
    'vence_el', v_cliente.fecha_vencimiento_deuda,
    'movimientos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fecha', fecha,
        'concepto', coalesce(nullif(btrim(descripcion), ''),
                             case when tipo = 'DEBITO' then 'Compra' else 'Pago' end),
        'tipo', tipo,
        'monto', round(monto, 2),
        'saldo', round(saldo_corriente, 2)
      ) order by fecha, creado_en), '[]'::jsonb)
      from periodo
    )
  )
  into v_out;

  return v_out;
end;
$$;

comment on function public.resumen_cuenta_por_token(text) is
  'Resumen de cuenta corriente por token, para la página pública /r/[token]. '
  'SECURITY DEFINER: el token es la credencial y anon no tiene policies sobre '
  'clientes. No es un comprobante fiscal.';

-- La página es pública: la ejecuta anon.
grant execute on function public.resumen_cuenta_por_token(text) to anon, authenticated;
