-- Los siete rubros que el código declara, ahora también en la base.
--
-- `entities/config/types.ts` define `Rubro` con siete valores desde hace
-- tiempo, pero el CHECK solo aceptaba dos: un comercio de ferretería o de
-- kiosco no se podía ni dar de alta, y el tipo prometía algo que la base
-- rechazaba.
--
-- Lo que cambia con esto es qué plantilla de mercadería baja cada comercio
-- (ver features/stock/lib/columnas-por-rubro.ts): una carnicería tenía que
-- llenar `memoria` y no tenía dónde poner el peso.
--
-- Es aditivo: los cuatro negocios vivos siguen en indumentaria o electro y no
-- se tocan.

alter table public.configuracion_pos
  drop constraint if exists configuracion_pos_rubro_check;

alter table public.configuracion_pos
  add constraint configuracion_pos_rubro_check
  check (rubro = any (array[
    'indumentaria','electro','alimentos','farmacia',
    'ferreteria','quioscos','otros'
  ]));

comment on column public.configuracion_pos.rubro is
  'Rubro operativo del comercio. Decide qué columnas trae la plantilla de mercadería (columnas-por-rubro.ts) y cómo se muestra la identidad del producto en Inventario. Fail-closed: un valor desconocido se lee como indumentaria.';
