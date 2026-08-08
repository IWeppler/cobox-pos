-- Clientes: dirección para el que NO factura, y unicidad de CUIT/DNI.
--
-- 1. DIRECCIÓN COMERCIAL
--
-- Hoy `direccion` (y localidad/provincia/CP) son el DOMICILIO FISCAL: la UI
-- solo los muestra con el toggle "Cliente Fiscal" prendido, y las actions
-- escriben null cuando está apagado. Consecuencia: un cliente común —el 100%
-- de los 192 que existen— NO puede tener dirección. Ni para una entrega.
--
-- Se agrega una columna en vez de reusar `direccion` porque son dos datos
-- distintos que pueden diferir: el domicilio fiscal es el que está registrado
-- en ARCA y va impreso en la factura; el comercial es dónde se entrega. Y
-- porque reinterpretar `direccion` cambiaría en silencio el significado de lo
-- ya guardado.

alter table public.clientes
  add column if not exists direccion_comercial text;

comment on column public.clientes.direccion_comercial is
  'Dirección de contacto/entrega. Existe para cualquier cliente. El domicilio fiscal (el que va en la factura) es `direccion`.';

comment on column public.clientes.direccion is
  'Domicilio fiscal, el que va impreso en la factura. Para la dirección de entrega ver `direccion_comercial`.';

-- 2. UNICIDAD DE CUIT Y DNI
--
-- `crearClienteAction` ya traduce el error 23505 a "Ya existe un cliente con
-- ese DNI o CUIT"... pero NO había ningún índice único: ese mensaje era código
-- muerto y los duplicados entraban sin chistar. Dos fichas del mismo CUIT es
-- exactamente lo que rompe una cuenta corriente (la deuda queda partida en
-- dos) y lo que hace facturar a nombre de la ficha equivocada.
--
-- Es el momento más barato para ponerlo: hoy hay 192 clientes, 0 con CUIT, 52
-- con DNI y CERO duplicados de cualquiera de los dos. No hay nada que migrar.
--
-- Únicos POR NEGOCIO: dos comercios distintos pueden (y suelen) tener al mismo
-- cliente, y no tienen por qué verse ni pisarse.
--
-- PARCIALES: la enorme mayoría de los clientes no tiene ni CUIT ni DNI, y sin
-- el `where` un único trataría todos esos NULL... bueno, los NULL no chocan,
-- pero la cadena vacía SÍ. El filtro cubre las dos formas de "no tiene dato".

create unique index if not exists clientes_negocio_cuit_unico_idx
  on public.clientes (negocio_id, cuit)
  where cuit is not null and cuit <> '';

create unique index if not exists clientes_negocio_dni_unico_idx
  on public.clientes (negocio_id, dni)
  where dni is not null and dni <> '';
