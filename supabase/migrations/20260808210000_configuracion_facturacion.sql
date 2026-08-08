-- Configuración de facturación: que el panel guarde de verdad.
--
-- El panel "Ticket de Venta" (features/ticket/TicketPanel.tsx) ya ofrecía
-- modo de facturación, punto de venta y comprobante por defecto, pero NINGUNA
-- de las tres columnas existía: el submit era un setTimeout con un toast de
-- éxito. El usuario elegía "Automática (ARCA)", veía "Configuración fiscal
-- actualizada" y no se guardaba nada. Peor que no tener la opción.
--
-- Tres columnas, dos ejes (ver features/ticket/lib/facturacion.ts):
--
--   modo_facturacion     CAPACIDAD: de dónde sale el comprobante.
--     INTERNO   ticket sin validez fiscal. Estado inicial de los 4 negocios.
--     MANUAL    la venta se registra acá, la factura se hace a mano en ARCA.
--     ARCA      Comerz pide el CAE y emite factura electrónica.
--   comprobante_defecto  ELECCIÓN: qué sale por defecto en la caja.
--   punto_venta          el de ARCA. NULL = todavía no dado de alta, que es
--                        un estado legítimo y distinto de un valor inválido.
--
-- Los defaults dejan a los 4 negocios exactamente como están hoy: INTERNO +
-- TICKET es lo que el POS ya hace. Esta migración no cambia ni una venta.

alter table public.configuracion_pos
  add column if not exists modo_facturacion    text not null default 'INTERNO',
  add column if not exists comprobante_defecto text not null default 'TICKET',
  add column if not exists punto_venta         integer;

alter table public.configuracion_pos
  drop constraint if exists configuracion_pos_modo_facturacion_check;

alter table public.configuracion_pos
  add constraint configuracion_pos_modo_facturacion_check
  check (modo_facturacion in ('INTERNO', 'MANUAL', 'ARCA'));

alter table public.configuracion_pos
  drop constraint if exists configuracion_pos_comprobante_defecto_check;

-- La regla dura, y por eso vive en la base: un comercio que NO emite fiscal no
-- puede tener una factura como comprobante por defecto. Sin este CHECK, un
-- comercio en INTERNO con 'FACTURA_B' imprimiría un papel que dice factura y
-- no tiene CAE — un documento inválido emitido a nombre del comercio.
--
-- La otra regla (que la letra corresponda a la condición de IVA del emisor:
-- un monotributista no emite A ni B) NO es CHECK a propósito: vive en
-- facturacion.ts y la valida la action. Como CHECK impediría que un comercio
-- que pasa de Monotributo a Responsable Inscripto guarde el cambio de
-- condición mientras arrastra un default viejo, y ese es justo el momento en
-- que más necesita poder editar su configuración.
alter table public.configuracion_pos
  add constraint configuracion_pos_comprobante_defecto_check
  check (
    comprobante_defecto in ('TICKET', 'FACTURA_A', 'FACTURA_B', 'FACTURA_C')
    and (comprobante_defecto = 'TICKET' or modo_facturacion = 'ARCA')
  );

alter table public.configuracion_pos
  drop constraint if exists configuracion_pos_punto_venta_check;

-- Rango de ARCA: 1..99999 (se imprime con 5 dígitos). El 0 no existe.
alter table public.configuracion_pos
  add constraint configuracion_pos_punto_venta_check
  check (punto_venta is null or (punto_venta between 1 and 99999));

comment on column public.configuracion_pos.modo_facturacion is
  'INTERNO | MANUAL | ARCA. Solo ARCA emite comprobantes con CAE; MANUAL factura fuera de Comerz y para el POS se comporta como INTERNO.';
comment on column public.configuracion_pos.comprobante_defecto is
  'Comprobante preseleccionado en la caja. Solo puede ser una factura si modo_facturacion = ARCA (CHECK).';
comment on column public.configuracion_pos.punto_venta is
  'Punto de venta de ARCA (1..99999). NULL = todavía no dado de alta.';

-- Permiso propio para la configuración fiscal.
--
-- Hoy la policy de UPDATE de configuracion_pos es `auth.role() =
-- 'authenticated'`: CUALQUIER usuario del negocio puede editar la config,
-- incluida una vendedora. Para el nombre del comercio es discutible; para el
-- modo de facturación y el punto de venta no lo es. La action chequea este
-- permiso — un server action es un endpoint, el tab escondido no es control
-- de acceso.
--
-- (La policy amplia queda como está: apretarla ahora tocaría el guardado de
-- config de los 4 negocios de una, y ese es un cambio aparte con su propia
-- prueba.)
insert into public.permisos (clave, modulo, descripcion)
values (
  'configuracion.facturacion',
  'configuracion',
  'Configurar el modo de facturación, el punto de venta y la conexión con ARCA'
)
on conflict (clave) do nothing;

-- Se otorga a quien ya administra empleados y permisos: es el rol que hoy
-- manda en la configuración del comercio, así que nadie gana capacidad nueva.
insert into public.rol_permisos (rol_id, permiso_id, negocio_id)
select rp.rol_id, nuevo.id, rp.negocio_id
  from public.rol_permisos rp
  join public.permisos actual
    on actual.id = rp.permiso_id
   and actual.clave = 'configuracion.empleados_y_permisos'
 cross join (
   select id from public.permisos where clave = 'configuracion.facturacion'
 ) as nuevo
on conflict (rol_id, permiso_id) do nothing;
