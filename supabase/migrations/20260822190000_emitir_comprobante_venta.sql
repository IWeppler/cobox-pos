-- Numerar + grabar el comprobante en UN round-trip.
--
-- POR QUÉ: `emitirComprobante` hacía dos viajes seguidos —
-- `siguiente_numero_comprobante` y después el insert en `comprobantes`— y los
-- paga TODA venta, incluidas las de un solo renglón. Medido sobre la traza de
-- una venta real: 96 ms de numeración + 45 ms de insert ≈ 140 ms.
--
-- Para comparar: el loop de `ajustar_stock_variante` (un viaje por renglón)
-- cuesta ~27 ms en la venta promedio de Evens, que tiene 1,91 renglones. O sea
-- que en el ticket típico el comprobante pesaba MÁS que el stock.
--
-- QUÉ SE MANTIENE, porque acá cada cosa está como está por un motivo:
--
-- * La numeración es el MISMO `insert ... on conflict do update ... returning`
--   de `siguiente_numero_comprobante`. Un solo statement, mismo row lock: dos
--   cajas vendiendo a la vez se siguen serializando. Nunca `max(numero) + 1`.
-- * SECURITY INVOKER (sin cláusula = invoker). El aislamiento entre negocios
--   tiene que seguir siendo la RLS de quien llama, igual que en
--   `registrar_venta`. `negocio_id` sale del DEFAULT
--   `security.current_negocio_id()` en las dos tablas.
-- * `neto` e `iva_monto` en 0: solo la Factura A discrimina IVA. Partirlo acá
--   sería inventar un desglose que el papel no dice.
-- * `comprobantes` sigue sin policy de UPDATE ni DELETE. Esta función solo
--   inserta; la inmutabilidad no se toca.
--
-- QUÉ CAMBIA, y es a mejor: al ir las dos escrituras en la misma transacción,
-- si el insert falla el número se revierte con ella. Antes el número quedaba
-- consumido y se dejaba un hueco en la numeración a propósito (era preferible
-- a arriesgar dos comprobantes con el mismo número). Ahora no hace falta
-- elegir: no hay hueco Y no hay duplicado.
--
-- `siguiente_numero_comprobante` NO se borra: sigue siendo la forma de pedir
-- un número suelto, y con ARCA el orden va a ser otro (primero el CAE, después
-- el registro), así que va a hacer falta separada de nuevo.
--
-- ADITIVA: no cambia nada hasta que el código la llame. Por eso va antes del
-- deploy, no después.

create or replace function public.emitir_comprobante_venta(
  p_venta_id uuid,
  p_tipo text,
  p_punto_venta integer,
  p_total numeric,
  p_emitido_por uuid,
  p_cliente_id uuid default null,
  p_receptor_razon_social text default null,
  p_receptor_cuit text default null,
  p_receptor_condicion_iva text default null
)
returns bigint
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_numero bigint;
begin
  insert into public.comprobante_numeracion as n
    (punto_venta, tipo, ultimo_numero)
  values (p_punto_venta, p_tipo, 1)
  on conflict (negocio_id, punto_venta, tipo) do update
    set ultimo_numero = n.ultimo_numero + 1,
        actualizado_en = now()
  returning n.ultimo_numero into v_numero;

  insert into public.comprobantes (
    venta_id, tipo, punto_venta, numero,
    cliente_id, receptor_razon_social, receptor_cuit, receptor_condicion_iva,
    neto, iva_monto, total, emitido_por
  ) values (
    p_venta_id, p_tipo, p_punto_venta, v_numero,
    p_cliente_id, p_receptor_razon_social, p_receptor_cuit, p_receptor_condicion_iva,
    0, 0, p_total, p_emitido_por
  );

  return v_numero;
end;
$function$;

comment on function public.emitir_comprobante_venta(uuid, text, integer, numeric, uuid, uuid, text, text, text) is
  'Numera y graba el comprobante de una venta en UN round-trip. Antes eran dos (siguiente_numero_comprobante + insert), ~140 ms en TODA venta. SECURITY INVOKER a proposito: el aislamiento sigue siendo la RLS del que llama, igual que registrar_venta. Al ir en una transaccion, si el insert falla el numero tambien se revierte: ya no quedan huecos en la numeracion.';

grant execute on function public.emitir_comprobante_venta(uuid, text, integer, numeric, uuid, uuid, text, text, text) to authenticated;
