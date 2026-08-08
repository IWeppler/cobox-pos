-- Egresos: separar qué SALE de la caja de qué es GASTO.
--
-- Hasta ahora `egresos` era una bolsa: el flete, el retiro de la dueña y el
-- pago al proveedor entraban todos igual. Las tres cosas vacían el cajón,
-- pero solo una es gasto, y la ganancia se calcula restando el total
-- (get-dashboard-metrics.ts): un retiro le baja la ganancia a la dueña
-- cuando en realidad es la ganancia que ya hizo, y una compra de mercadería
-- se cuenta DOS VECES, porque el costo ya viaja en precio_costo cuando el
-- producto se vende.
--
--   OPERATIVO          gasto del negocio (luz, flete, café). Resta ganancia.
--   RETIRO_SOCIO       la dueña saca plata. Sale del cajón, NO es gasto.
--   COMPRA_MERCADERIA  pago a proveedor. Ya está contado en el costo.
--
-- El cierre de caja sigue restando los tres: el efectivo esperado es plata
-- física y los tres se la llevan. Lo que cambia es el resultado, no el arqueo.
--
-- CHECK fail-closed y default OPERATIVO: un egreso viejo o uno que llegue sin
-- tipo se comporta como se comportaba hasta hoy (resta), que es el lado
-- conservador para la ganancia.

alter table public.egresos
  add column if not exists tipo text not null default 'OPERATIVO';

alter table public.egresos
  drop constraint if exists egresos_tipo_check;

alter table public.egresos
  add constraint egresos_tipo_check
  check (tipo in ('OPERATIVO', 'RETIRO_SOCIO', 'COMPRA_MERCADERIA'));

-- Trazabilidad del pago a proveedor. Sin FK dura sería un texto suelto; con
-- ella el egreso se puede abrir contra el remito que lo originó.
-- ON DELETE SET NULL a propósito: si alguna vez se borra la orden, el egreso
-- NO se borra — la plata salió igual y el arqueo del turno tiene que seguir
-- cerrando.
alter table public.egresos
  add column if not exists orden_compra_id uuid
  references public.ordenes_compra(id) on delete set null;

-- Solo una compra de mercadería puede apuntar a un remito. Evita que un
-- retiro quede colgado de una orden por un bug de UI.
alter table public.egresos
  drop constraint if exists egresos_orden_compra_solo_en_compra;

alter table public.egresos
  add constraint egresos_orden_compra_solo_en_compra
  check (orden_compra_id is null or tipo = 'COMPRA_MERCADERIA');

-- Los reportes filtran por tipo dentro de un rango de fechas del negocio.
create index if not exists egresos_negocio_tipo_fecha_idx
  on public.egresos (negocio_id, tipo, fecha desc);

comment on column public.egresos.tipo is
  'OPERATIVO resta ganancia; RETIRO_SOCIO y COMPRA_MERCADERIA salen de la caja pero NO son gasto (el costo de la mercadería ya viaja en precio_costo).';
