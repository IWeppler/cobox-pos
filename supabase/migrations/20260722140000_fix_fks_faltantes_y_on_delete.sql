-- Auditoría completa de FKs: el bootstrap de este proyecto (2026-07-21,
-- ver 20260722130000) perdió sistemáticamente cláusulas ON DELETE y
-- algunas FKs enteras respecto de prod. Disparado por dos bugs reales:
-- no se podía eliminar un producto referenciado en ordenes_items
-- (bloqueaba en vez de SET NULL) y anular venta no aparecía para admin
-- (perfiles.rol_id resolvía a VENDEDOR pese a rol='ADMIN', ver UPDATE
-- de perfiles más abajo). Se verificó cero filas huérfanas antes de
-- aplicar cada ADD CONSTRAINT.

-- 1. Perfil con rol_id desincronizado del texto legacy `rol`.
UPDATE public.perfiles p
SET rol_id = r.id
FROM public.roles r
WHERE r.nombre = p.rol AND p.rol_id != r.id;

-- 2. FKs completamente ausentes en este proyecto.
ALTER TABLE public.actualizaciones_precio
  ADD CONSTRAINT actualizaciones_precio_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;

ALTER TABLE public.bajas
  ADD CONSTRAINT mermas_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;

ALTER TABLE public.categorias
  ADD CONSTRAINT categorias_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.categorias(id) ON DELETE CASCADE;

ALTER TABLE public.cuenta_corriente_movimientos
  ADD CONSTRAINT cuenta_corriente_movimientos_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES auth.users(id);

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.promociones
  ADD CONSTRAINT promociones_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES auth.users(id);

ALTER TABLE public.ventas_items
  ADD CONSTRAINT ventas_items_promocion_id_fkey
  FOREIGN KEY (promocion_id) REFERENCES public.promociones(id);

-- 3. bajas.producto_id existe con el nombre autogenerado del bootstrap
-- (bajas_producto_id_fkey) en vez del nombre real de prod, y sin el
-- ON DELETE CASCADE real.
ALTER TABLE public.bajas
  DROP CONSTRAINT bajas_producto_id_fkey;

ALTER TABLE public.bajas
  ADD CONSTRAINT mermas_producto_id_fkey
  FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;

-- 4. FKs existentes con ON DELETE distinto al real de prod (mismo bug
-- que bloqueaba eliminar un producto referenciado en ordenes_items,
-- latente en el resto de estas).
ALTER TABLE public.cuenta_corriente_movimientos
  DROP CONSTRAINT cuenta_corriente_movimientos_pago_id_fkey,
  ADD CONSTRAINT cuenta_corriente_movimientos_pago_id_fkey
    FOREIGN KEY (pago_id) REFERENCES public.venta_pagos(id) ON DELETE SET NULL;

ALTER TABLE public.cuenta_corriente_movimientos
  DROP CONSTRAINT cuenta_corriente_movimientos_venta_id_fkey,
  ADD CONSTRAINT cuenta_corriente_movimientos_venta_id_fkey
    FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_items
  DROP CONSTRAINT ordenes_items_producto_id_fkey,
  ADD CONSTRAINT ordenes_items_producto_id_fkey
    FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL;

ALTER TABLE public.productos
  DROP CONSTRAINT productos_categoria_id_fkey,
  ADD CONSTRAINT productos_categoria_id_fkey
    FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;

ALTER TABLE public.venta_pagos
  DROP CONSTRAINT venta_pagos_cliente_id_fkey,
  ADD CONSTRAINT venta_pagos_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;

ALTER TABLE public.venta_pagos
  DROP CONSTRAINT venta_pagos_metodo_pago_id_fkey,
  ADD CONSTRAINT venta_pagos_metodo_pago_id_fkey
    FOREIGN KEY (metodo_pago_id) REFERENCES public.metodos_pago(id) ON DELETE SET NULL;

ALTER TABLE public.venta_pagos
  DROP CONSTRAINT venta_pagos_turno_caja_id_fkey,
  ADD CONSTRAINT venta_pagos_turno_caja_id_fkey
    FOREIGN KEY (turno_caja_id) REFERENCES public.turnos_caja(id) ON DELETE SET NULL;

ALTER TABLE public.ventas
  DROP CONSTRAINT ventas_cliente_id_fkey,
  ADD CONSTRAINT ventas_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.ventas
  DROP CONSTRAINT ventas_turno_caja_id_fkey,
  ADD CONSTRAINT ventas_turno_caja_id_fkey
    FOREIGN KEY (turno_caja_id) REFERENCES public.turnos_caja(id) ON DELETE SET NULL;

ALTER TABLE public.ventas_items
  DROP CONSTRAINT ventas_items_producto_id_fkey,
  ADD CONSTRAINT ventas_items_producto_id_fkey
    FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL;
