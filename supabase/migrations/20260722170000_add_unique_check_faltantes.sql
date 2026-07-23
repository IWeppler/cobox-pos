-- Segunda pasada de la auditoría prod vs este proyecto: UNIQUE/CHECK que
-- el bootstrap perdió. Se verificó cero filas violatorias antes de aplicar
-- cada constraint.

ALTER TABLE public.atributo_valores
  ADD CONSTRAINT atributo_valores_atributo_id_slug_key UNIQUE (atributo_id, slug);

ALTER TABLE public.atributos
  ADD CONSTRAINT atributos_slug_key UNIQUE (slug);

ALTER TABLE public.bajas
  ADD CONSTRAINT bajas_origen_check
  CHECK (origen = ANY (ARRAY['MANUAL'::text, 'DEVOLUCION_VENTA'::text]));

ALTER TABLE public.bajas
  ADD CONSTRAINT mermas_estado_check
  CHECK (estado = ANY (ARRAY['PENDIENTE'::text, 'APROBADA'::text, 'RECHAZADA'::text]));

ALTER TABLE public.categoria_atributos
  ADD CONSTRAINT categoria_atributos_categoria_id_atributo_id_key UNIQUE (categoria_id, atributo_id);

ALTER TABLE public.categorias
  ADD CONSTRAINT categorias_slug_key UNIQUE (slug);

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol = ANY (ARRAY['ADMIN'::text, 'VENDEDOR'::text]));

ALTER TABLE public.producto_variante_valores
  ADD CONSTRAINT producto_variante_valores_variante_id_atributo_id_key UNIQUE (variante_id, atributo_id);

ALTER TABLE public.productos
  ADD CONSTRAINT productos_slug_key UNIQUE (slug);

ALTER TABLE public.productos_stock
  ADD CONSTRAINT productos_stock_producto_id_variante_key UNIQUE (producto_id, variante);

ALTER TABLE public.turnos_caja
  ADD CONSTRAINT turnos_caja_estado_check
  CHECK (estado = ANY (ARRAY['ABIERTO'::text, 'CERRADO'::text]));

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_motivo_anulacion_check
  CHECK (motivo_anulacion = ANY (ARRAY['RESTAURAR_STOCK'::text, 'BAJA'::text]));

-- Le faltaba el valor BLOQUEADO_FALTANTE (usado por guardar_variantes_producto
-- cuando el payload trae menos variantes de las que existen).
ALTER TABLE public.producto_variantes_auditoria
  DROP CONSTRAINT producto_variantes_auditoria_accion_check,
  ADD CONSTRAINT producto_variantes_auditoria_accion_check
    CHECK (accion = ANY (ARRAY['CREADA'::text, 'ACTUALIZADA'::text, 'ELIMINADA'::text, 'BLOQUEADO_FALTANTE'::text]));
