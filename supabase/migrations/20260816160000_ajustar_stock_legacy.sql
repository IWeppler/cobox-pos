-- Delta atómico sobre el espejo legacy `productos_stock`.
--
-- El espejo se sincroniza en cada escritura de stock, y hasta acá siempre se lo
-- tocaba leyendo la cantidad y escribiendo después la suma. Ese patrón pierde
-- actualizaciones: entre la lectura y la escritura entra otra operación sobre el
-- mismo producto y el update la pisa. Es el mismo error que ya costó plata dos
-- veces en este proyecto, y era el único lugar del camino de la venta que
-- todavía lo tenía (la venta ya lo resolvió dentro de `registrar_venta`).
--
-- Se resuelve con `cantidad = cantidad + p_delta` en un solo statement, que es
-- atómico a nivel de fila y no necesita leer nada antes.
--
-- El `insert ... on conflict` cubre el caso que la anulación ya contemplaba: un
-- producto que no tiene fila en el espejo (venta vieja, producto migrado a
-- medias). Sin él, devolver ese stock no haría nada y en silencio.
--
-- Nunca baja de cero: el espejo es informativo y un negativo ahí no es "deuda
-- de stock", es un dato roto que después alguien lee como si fuera real. El
-- stock canónico (`producto_variantes`, vía `ajustar_stock_variante`) sí puede
-- ir negativo cuando el comercio habilita vender sin stock, y esa decisión vive
-- allá.

create or replace function public.ajustar_stock_legacy(
  p_producto_id uuid,
  p_variante text,
  p_delta numeric
)
returns void
language plpgsql
security invoker
set search_path = public, security, pg_temp
as $$
begin
  insert into public.productos_stock (negocio_id, producto_id, variante, cantidad)
  values (
    security.current_negocio_id(),
    p_producto_id,
    p_variante,
    greatest(0, p_delta)
  )
  on conflict (producto_id, variante) do update
    set cantidad = greatest(0, public.productos_stock.cantidad + p_delta);
end;
$$;

comment on function public.ajustar_stock_legacy(uuid, text, numeric) is
  'Suma (o resta) sobre el espejo legacy productos_stock en un solo statement. '
  'Existe para no volver a leer-y-después-escribir esa tabla. El stock real se '
  'mueve con ajustar_stock_variante; esto solo mantiene el espejo.';

revoke all on function public.ajustar_stock_legacy(uuid, text, numeric) from public;
grant execute on function public.ajustar_stock_legacy(uuid, text, numeric) to authenticated;
