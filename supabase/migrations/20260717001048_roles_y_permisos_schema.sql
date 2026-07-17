-- ============================================================
-- Sistema de roles y permisos — Fase 2 (schema) + Fase 3 (función central)
-- Solo base de datos: no se toca ninguna policy RLS existente ni se
-- construye la UI de "Empleados y Permisos" todavía.
-- ============================================================

-- 1. Tabla roles
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  es_sistema boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles (nombre, es_sistema) VALUES
  ('ADMIN', true),
  ('ENCARGADO', true),
  ('VENDEDOR', true);

-- 2. Tabla permisos — catálogo de claves
CREATE TABLE public.permisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  modulo text NOT NULL,
  descripcion text
);

INSERT INTO public.permisos (clave, modulo, descripcion) VALUES
  ('ventas.anular', 'ventas', 'Anular una venta ya confirmada'),
  ('ventas.ver_todas', 'ventas', 'Ver las ventas de todos los vendedores, no solo las propias'),
  ('caja.cerrar_ajena', 'caja', 'Cerrar el turno de caja de otro vendedor'),
  ('stock.ingresar_remito', 'stock', 'Cargar un remito/orden de compra entrante'),
  ('stock.ver_historial_precios', 'stock', 'Ver el historial de cambios de precio de un producto'),
  ('stock.actualizar_precios_masivo', 'stock', 'Aplicar una actualización de precios masiva por lote'),
  ('stock.dar_baja', 'stock', 'Aprobar o rechazar una baja de stock reportada'),
  ('stock.eliminar_producto', 'stock', 'Eliminar un producto de forma permanente'),
  ('stock.editar_producto', 'stock', 'Editar los datos de un producto existente'),
  ('stock.cambiar_categoria', 'stock', 'Cambiar la categoría de un producto'),
  ('clientes.ver_modulo', 'clientes', 'Acceder al módulo de clientes'),
  ('clientes.importar_csv', 'clientes', 'Importar clientes de forma masiva desde CSV'),
  ('reportes.ver_modulo', 'reportes', 'Acceder al módulo de reportes'),
  ('reportes.ver_todos_empleados', 'reportes', 'Ver reportes de todos los empleados, no solo los propios'),
  ('configuracion.empleados_y_permisos', 'configuracion', 'Gestionar empleados, roles y permisos');

-- 3. Tabla rol_permisos — asignación rol -> permiso
CREATE TABLE public.rol_permisos (
  rol_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permiso_id uuid NOT NULL REFERENCES public.permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

-- ADMIN: todos los permisos del catálogo.
INSERT INTO public.rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.nombre = 'ADMIN';

-- ENCARGADO: subconjunto operativo para un supervisor de turno —
-- puede anular ventas, ver las de todo el equipo, cerrar la caja de un
-- vendedor que ya se fue, recibir mercadería, mantener el catálogo
-- (editar producto/categoría), ver historial de precios, aprobar bajas
-- reportadas y ver reportes propios y de todo el equipo. NO incluye
-- acciones destructivas/masivas (eliminar producto, reprecificar en
-- masa, importar clientes por CSV) ni gestión de empleados y permisos
-- — esas quedan reservadas a ADMIN.
INSERT INTO public.rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.nombre = 'ENCARGADO'
  AND p.clave IN (
    'ventas.anular',
    'ventas.ver_todas',
    'caja.cerrar_ajena',
    'stock.ingresar_remito',
    'stock.ver_historial_precios',
    'stock.dar_baja',
    'stock.editar_producto',
    'stock.cambiar_categoria',
    'clientes.ver_modulo',
    'reportes.ver_modulo',
    'reportes.ver_todos_empleados'
  );

-- VENDEDOR: ningún permiso de esta tabla — el acceso base a ventas/POS
-- no se modela acá, es el mínimo implícito de cualquier empleado.

-- Bloqueo total vía RLS hasta que la fase de UI ("Empleados y
-- Permisos") defina policies explícitas de lectura/escritura. Las
-- funciones is_admin()/tiene_permiso() son SECURITY DEFINER y no se
-- ven afectadas por esto.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;

-- 4. Migrar perfiles para referenciar roles.id
ALTER TABLE public.perfiles ADD COLUMN rol_id uuid REFERENCES public.roles(id);

UPDATE public.perfiles p
SET rol_id = r.id
FROM public.roles r
WHERE r.nombre = p.rol;

-- Default para altas futuras de perfiles que no especifiquen rol_id,
-- espejando el default actual de la columna de texto ('VENDEDOR').
CREATE OR REPLACE FUNCTION public.rol_vendedor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.roles WHERE nombre = 'VENDEDOR';
$function$;

ALTER TABLE public.perfiles ALTER COLUMN rol_id SET DEFAULT public.rol_vendedor_id();

-- Los 4 perfiles existentes ya quedaron backfillados (ADMIN/VENDEDOR
-- cubren el 100% de los casos actuales), así que el FK puede exigirse.
ALTER TABLE public.perfiles ALTER COLUMN rol_id SET NOT NULL;

-- La columna de texto `rol` se deja intacta a propósito: todo el
-- código de la app (middleware, sidebar, cada page.tsx) todavía la lee
-- como string plano y esta fase es solo de base de datos. `rol_id` es
-- la fuente de verdad nueva para is_admin()/tiene_permiso() de acá en
-- más; unificar o retirar `rol` queda para cuando se migre ese código,
-- en la fase de "Empleados y Permisos".

-- 5. is_admin() ahora resuelve vía roles, no vía el texto plano —
-- mismo nombre, mismos argumentos, mismo tipo de retorno, así que
-- ninguna policy que ya lo usa necesita cambiar.
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    JOIN public.roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid() AND r.nombre = 'ADMIN'
  );
$function$;

-- ============================================================
-- Fase 3: función central de permisos
-- ============================================================
CREATE OR REPLACE FUNCTION public.tiene_permiso(clave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      JOIN public.roles r ON r.id = p.rol_id
      WHERE p.id = auth.uid() AND r.nombre = 'ADMIN'
    )
    OR EXISTS (
      SELECT 1
      FROM public.perfiles p
      JOIN public.rol_permisos rp ON rp.rol_id = p.rol_id
      JOIN public.permisos perm ON perm.id = rp.permiso_id
      WHERE p.id = auth.uid() AND perm.clave = tiene_permiso.clave
    );
$function$;
