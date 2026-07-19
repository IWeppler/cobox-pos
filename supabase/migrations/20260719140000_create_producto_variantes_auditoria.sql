-- Auditoría de producto_variantes: editarProductoAction borra y reinserta
-- TODAS las variantes de un producto en cada guardado, así que un stock
-- pisado por error (o cualquier otro dato perdido) no deja rastro una vez
-- corrido el DELETE. Igual que actualizaciones_precio_items para precios,
-- esta tabla guarda el antes/después de cada variante en cada edición.
CREATE TABLE IF NOT EXISTS public.producto_variantes_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  variante_id_anterior uuid NULL REFERENCES public.producto_variantes(id) ON DELETE SET NULL,
  variante_id_nueva uuid NULL REFERENCES public.producto_variantes(id) ON DELETE SET NULL,
  atributos jsonb NOT NULL DEFAULT '{}'::jsonb,
  nombre_display text NULL,
  accion text NOT NULL CHECK (accion IN ('CREADA', 'ACTUALIZADA', 'ELIMINADA')),
  stock_anterior integer NULL,
  stock_nuevo integer NULL,
  precio_anterior numeric(12,2) NULL,
  precio_nuevo numeric(12,2) NULL,
  costo_anterior numeric(12,2) NULL,
  costo_nuevo numeric(12,2) NULL,
  editado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producto_variantes_auditoria_producto_id
  ON public.producto_variantes_auditoria(producto_id, creado_en DESC);

ALTER TABLE public.producto_variantes_auditoria ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede dejar registro de la edición que
-- acaba de hacer (mismo criterio que editarProductoAction, que corre con
-- la sesión del usuario logueado, no con service role).
CREATE POLICY "producto_variantes_auditoria_insert_authenticated"
  ON public.producto_variantes_auditoria FOR INSERT TO authenticated
  WITH CHECK (true);

-- Es data de auditoría/histórico: solo admin la puede leer, igual que el
-- historial de ajustes de precio (ver listarHistorialPreciosAction).
CREATE POLICY "producto_variantes_auditoria_select_admin"
  ON public.producto_variantes_auditoria FOR SELECT TO authenticated
  USING (is_admin());

-- Sin políticas de UPDATE/DELETE: con RLS habilitado y ninguna policy que
-- las cubra, quedan bloqueadas por default — es un log de solo-inserción.
