-- Productos: tratamiento frente al IVA, unidad de medida y género.
--
-- Es el dato que falta para que una factura pueda discriminar el impuesto.
-- Hoy `comprobantes` guarda neto e iva_monto en 0 porque no hay de dónde
-- sacarlos: ningún producto sabe a qué alícuota tributa.
--
-- TRATAMIENTO_IVA: un solo campo, no dos.
--
-- La tentación es guardar "alícuota" por un lado y "exento/gravado" por otro.
-- Con dos campos existen combinaciones imposibles —exento con 21%, gravado
-- con alícuota nula— y tarde o temprano alguien las guarda. Un solo valor dice
-- las dos cosas y no hay estado inválido que representar.
--
-- EXENTO y NO_GRAVADO se guardan distinto aunque los dos den impuesto cero: el
-- exento está alcanzado por el impuesto pero liberado, el no gravado queda
-- fuera del objeto del impuesto. En el libro de IVA van en columnas separadas.
--
-- Default 21% y CHECK fail-closed: es la alícuota general y la que corresponde
-- a prácticamente todo lo que venden los 4 negocios de hoy (indumentaria y
-- electro). Los ~1.500 productos existentes quedan en 21%, que es lo correcto
-- para todos ellos — esta migración no cambia ningún precio ni ninguna venta,
-- solo agrega el dato que hasta ahora no existía.

alter table public.productos
  add column if not exists tratamiento_iva text not null default 'GRAVADO_21',
  add column if not exists unidad_medida   text not null default 'UNIDAD',
  add column if not exists genero          text;

alter table public.productos
  drop constraint if exists productos_tratamiento_iva_check;

alter table public.productos
  add constraint productos_tratamiento_iva_check
  check (tratamiento_iva in (
    'GRAVADO_21', 'GRAVADO_105', 'GRAVADO_27', 'EXENTO', 'NO_GRAVADO'
  ));

alter table public.productos
  drop constraint if exists productos_unidad_medida_check;

-- Se guarda la unidad SEMÁNTICA, no el código numérico de ARCA. El código
-- fiscal es una traducción de esto y entra con la integración de ARCA, donde
-- se puede verificar contra la tabla oficial. Hardcodear acá números que hoy
-- no se pueden comprobar es sembrar un error que recién aparece con la primera
-- factura rechazada.
alter table public.productos
  add constraint productos_unidad_medida_check
  check (unidad_medida in ('UNIDAD', 'KG', 'GRAMO', 'LITRO', 'METRO', 'PAR'));

comment on column public.productos.tratamiento_iva is
  'GRAVADO_21 | GRAVADO_105 | GRAVADO_27 | EXENTO | NO_GRAVADO. Un solo campo dice alícuota Y condición: con dos campos separados existen combinaciones imposibles. El criterio vive en shared/lib/fiscal-producto.ts.';
comment on column public.productos.unidad_medida is
  'Unidad semántica de venta. El código de unidad de ARCA se traduce desde acá cuando se conecte la facturación; a propósito no se guarda el número.';
comment on column public.productos.genero is
  'Segmento del producto en indumentaria (Hombre, Mujer, Niño, Unisex). Libre y opcional: no hay una lista canónica que sirva para todos los rubros.';

-- El catálogo público filtra y el inventario agrupa por estos dos. Un índice
-- por negocio + tratamiento sirve además para el futuro libro de IVA, que
-- necesita separar las ventas por alícuota.
create index if not exists productos_negocio_tratamiento_iva_idx
  on public.productos (negocio_id, tratamiento_iva);
