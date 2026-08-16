-- `ventas.cantidad` pasa a contar UNIDADES, no renglones.
--
-- Se guardaba `items.length`, o sea la cantidad de líneas del ticket: vender 3
-- remeras iguales en una sola línea contaba 1. Verificado sobre las 514 ventas
-- confirmadas: en las 514 el valor guardado coincide con el número de
-- renglones, y en 24 difiere de las unidades reales.
--
-- Quienes leen esta columna la llaman "unidades" sin excepción: el gráfico del
-- panel (`build-chart-series.ts`), la tarjeta de rendimiento ("N u."), el
-- detalle de la tabla de ventas y —la que más importa— la columna "Unidades"
-- de la exportación para el contador. Las cuatro venían subcontando.
--
-- El backfill deja la columna significando UNA cosa a lo largo de toda la
-- historia. Sin él, cualquier informe que cruce meses compararía renglones
-- contra unidades sin que nada lo indique, que es peor que el error original
-- porque es invisible.
--
-- Es dato DERIVADO: sale de `ventas_items`, que es la fuente. Si mañana hay que
-- recalcularlo, este mismo UPDATE lo hace.
--
-- Las ventas sin renglones (no debería haber ninguna, pero la RPC recién ahora
-- lo garantiza) se dejan como están: poner 0 borraría el único rastro de qué
-- decía el ticket.

update public.ventas v
   set cantidad = sub.unidades
  from (
    select venta_id, sum(cantidad)::int as unidades
    from public.ventas_items
    group by venta_id
  ) as sub
 where sub.venta_id = v.id
   and v.cantidad is distinct from sub.unidades;

comment on column public.ventas.cantidad is
  'UNIDADES vendidas en el ticket (suma de ventas_items.cantidad), no cantidad '
  'de renglones. Derivada: la fuente es ventas_items.';

-- No es la columna de esta migración, pero el mismo malentendido estaba del
-- otro lado: `precio_costo` es el costo TOTAL de la venta (cada renglón ya
-- entra multiplicado por su cantidad), y tres lugares lo multiplicaban otra vez
-- por `cantidad` como si fuera unitario. En las 226 ventas de más de un renglón
-- eso daba $25.386.500 de costo contra $6.323.000 real. Se corrigió en el
-- código (crm-tab.tsx y scoring-desde-cliente.ts); el comentario queda acá para
-- que la próxima persona no repita la cuenta.
comment on column public.ventas.precio_costo is
  'Costo TOTAL de la venta: suma de precio_costo * cantidad de cada renglón. '
  'NO es unitario — no multiplicarlo por ventas.cantidad.';
