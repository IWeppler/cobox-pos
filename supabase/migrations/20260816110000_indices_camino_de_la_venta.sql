-- Índices de las claves foráneas del camino de la venta.
--
-- Hasta acá estas tablas tenían índice por su PK y por negocio_id, y nada más.
-- Todo lo que las consulta por la venta, el turno o el cliente —o sea el ticket,
-- el cierre de caja y la ficha del cliente— recorría la tabla entera. Medido en
-- pg_stat_user_tables antes de esta migración:
--
--   venta_pagos                     623 filas   295.554 recorridos    92.000.000 filas leídas
--   ventas_items                    994 filas   286.307 recorridos   132.500.000 filas leídas
--   ventas                          520 filas    89.359 recorridos    16.100.000 filas leídas
--   cuenta_corriente_movimientos    453 filas     3.894 recorridos     1.500.000 filas leídas
--
-- Con estos tamaños todavía aguanta: recorrer 600 filas es barato. El problema
-- es que el costo crece con el CUADRADO del negocio — más ventas hacen a la vez
-- más recorridos y más filas por recorrido. El negocio que hoy tiene 424 ventas
-- va a tener 50.000, y ahí el cierre de caja deja de abrir.
--
-- Los compuestos arrancan por negocio_id a propósito: desde
-- 20260816100000 la RLS resuelve `negocio_id = <constante>` por statement, así
-- que ese es el primer filtro de TODA consulta y conviene que sea el prefijo
-- del índice en vez de una segunda pasada.
--
-- Los parciales (`where ... is not null`) existen porque la columna es opcional
-- y la mayoría de las filas la tienen vacía: una venta de mostrador no tiene
-- cliente, y no hay ninguna consulta que busque "las ventas sin cliente" por
-- esta vía. El índice se queda solo con las filas que alguien busca.
--
-- Todo aditivo: no se borra ni se reescribe ningún índice existente. Los
-- `idx_*_negocio_id` de una sola columna quedan redundantes contra los
-- compuestos nuevos, pero sacarlos es otra decisión y otra migración.

-- El detalle del ticket y la devolución al anular. Es el peor de todos:
-- 132 millones de filas leídas sobre una tabla de 994.
create index if not exists ventas_items_venta_idx
  on public.ventas_items (venta_id);

-- El desglose de pagos: lo lee el ticket, el historial y la anulación.
create index if not exists venta_pagos_venta_idx
  on public.venta_pagos (venta_id);

-- El arqueo del turno suma los pagos de su turno. Sin esto, cada cierre de
-- caja recorre todos los pagos de la historia del negocio.
create index if not exists venta_pagos_turno_idx
  on public.venta_pagos (turno_caja_id)
  where turno_caja_id is not null;

-- La ficha del cliente y el scoring: todas las ventas de una persona.
create index if not exists ventas_cliente_idx
  on public.ventas (cliente_id)
  where cliente_id is not null;

-- El cierre de caja del lado de las ventas, espejo del de venta_pagos.
create index if not exists ventas_turno_idx
  on public.ventas (turno_caja_id)
  where turno_caja_id is not null;

-- El panel, /caja y /reportes: siempre un rango de fechas de UN negocio.
-- DESC porque todas esas pantallas piden lo más reciente primero.
create index if not exists ventas_negocio_fecha_idx
  on public.ventas (negocio_id, fecha_venta desc);

-- El libro de cuenta corriente del cliente: la ficha, el detalle de deuda y la
-- reconstrucción de episodios del scoring. Ordenado por fecha porque el libro
-- se lee cronológicamente y el saldo se arma acumulando en ese orden.
create index if not exists cuenta_corriente_movimientos_cliente_fecha_idx
  on public.cuenta_corriente_movimientos (cliente_id, creado_en desc);

-- La trazabilidad de la promoción aplicada a una venta.
create index if not exists ventas_descuentos_venta_idx
  on public.ventas_descuentos (venta_id);

-- El EAN. Vive en producto_variantes.sku (misma columna que el SKU de
-- indumentaria, otro label) y es por donde busca el lector de código de barras
-- y la Carga Rápida de electro. Es la búsqueda que más tiene que tardar nada:
-- pasa con la clienta esperando en el mostrador.
--
-- NO es único, aunque un EAN debería serlo. Se intentó y los datos dijeron que
-- no: Estilo Bonito tiene hasta 9 variantes compartiendo el mismo `sku` (742D,
-- 40306, 1810...). No son duplicados a limpiar — ahí `sku` no es el código de
-- la variante sino el del MODELO, y todos los talles de una remera lo comparten.
-- O sea que la columna guarda dos cosas distintas según el rubro: en electro es
-- el EAN de la unidad, en indumentaria es el código del modelo.
--
-- Un índice único convertiría esa ambigüedad en un error al guardar productos
-- que hoy están bien cargados. Separar las dos semánticas en dos columnas es un
-- cambio de modelo con su propia migración; acá solo se busca velocidad.
--
-- Parcial porque la enorme mayoría de las variantes no tiene código —toda la
-- indumentaria que no lo usa— y esas filas nunca se buscan por esta vía.
create index if not exists producto_variantes_negocio_sku_idx
  on public.producto_variantes (negocio_id, sku)
  where sku is not null and sku <> '';
