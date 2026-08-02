-- Planes reales de Comerz, con sus límites y features en JSON.
--
-- La idea es que el código NO tenga cadenas de condicionales por plan: el plan
-- declara qué puede hacer (`features`) y hasta dónde (`max_*`), y tanto el
-- backend como la UI leen eso. Agregar un plan o mover un límite es cambiar
-- una fila, no desplegar código.
--
-- Los límites cuantitativos se aplican con TRIGGER, no sólo en la server
-- action: una action se puede saltear llamando a PostgREST directo con la
-- anon key, que es pública. El trigger no.

-- ---------------------------------------------------------------------------
-- Modalidad de cobro
-- ---------------------------------------------------------------------------
ALTER TABLE public.negocios
    ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'mensual';

ALTER TABLE public.negocios DROP CONSTRAINT IF EXISTS negocios_modalidad_check;
ALTER TABLE public.negocios ADD CONSTRAINT negocios_modalidad_check
    CHECK (modalidad IN ('mensual', 'semestral'));

COMMENT ON COLUMN public.negocios.modalidad IS
  'mensual = precio de lista; semestral = 15% off. El precio efectivo se calcula, no se guarda: si cambia el precio del plan, no quedan dos verdades.';

-- ---------------------------------------------------------------------------
-- Planes
-- ---------------------------------------------------------------------------
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS orden int NOT NULL DEFAULT 0;
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS descripcion text;

-- Emprendedor: el que arranca solo. Caja simple, un usuario, cuenta corriente
-- con tope.
UPDATE public.planes SET
  precio_mensual = 30000,
  orden = 10,
  descripcion = 'Para el que arranca solo: vender, cobrar y tener el stock ordenado.',
  reglas = jsonb_build_object(
    'max_usuarios', 1,
    'max_sucursales', 1,
    'max_clientes_cuenta_corriente', 100,
    'features', jsonb_build_array(
      'pos', 'caja', 'ventas', 'stock', 'catalogo_publico',
      'clientes', 'cuenta_corriente', 'tickets', 'historial_ventas'
    )
  )
WHERE nombre = 'Emprendedor';

-- Gestión: el comercio con empleados. Reportes, roles y multicaja.
UPDATE public.planes SET
  nombre = 'Gestión',
  precio_mensual = 50000,
  orden = 20,
  descripcion = 'Para el comercio con empleados: reportes, roles y varias cajas.',
  reglas = jsonb_build_object(
    'max_usuarios', 5,
    'max_sucursales', 1,
    -- null = sin tope
    'max_clientes_cuenta_corriente', null,
    'features', jsonb_build_array(
      'pos', 'caja', 'ventas', 'stock', 'catalogo_publico',
      'clientes', 'cuenta_corriente', 'tickets', 'historial_ventas',
      'cuenta_corriente_ilimitada', 'reportes', 'reportes_exportar',
      'multicaja', 'roles', 'auditoria'
    )
  )
WHERE nombre = 'Pro';

-- Empresa: varias sucursales e integraciones.
UPDATE public.planes SET
  nombre = 'Empresa',
  precio_mensual = 70000,
  orden = 30,
  descripcion = 'Para varias sucursales, con stock propio y dashboard consolidado.',
  reglas = jsonb_build_object(
    'max_usuarios', 99,
    'max_sucursales', 10,
    'max_clientes_cuenta_corriente', null,
    'features', jsonb_build_array(
      'pos', 'caja', 'ventas', 'stock', 'catalogo_publico',
      'clientes', 'cuenta_corriente', 'tickets', 'historial_ventas',
      'cuenta_corriente_ilimitada', 'reportes', 'reportes_exportar',
      'multicaja', 'roles', 'auditoria',
      'multisucursal', 'stock_por_sucursal', 'transferencias_sucursal',
      'dashboard_consolidado', 'permisos_avanzados',
      'facturacion_electronica', 'integraciones', 'api'
    )
  )
WHERE nombre = 'Enterprise';

-- ---------------------------------------------------------------------------
-- Lectura de reglas
-- ---------------------------------------------------------------------------

/** Reglas del plan del negocio activo. Objeto vacío si no tiene plan. */
CREATE OR REPLACE FUNCTION public.reglas_plan()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(p.reglas, '{}'::jsonb)
  FROM public.negocios n
  LEFT JOIN public.planes p ON p.id = n.plan_id
  WHERE n.id = security.current_negocio_id();
$function$;

/**
 * ¿El plan del negocio activo incluye esta feature?
 * Sin plan asignado NO se bloquea nada: los comercios que ya venían
 * trabajando no tienen plan cargado y apagarles la mitad del sistema sería
 * un incidente, no un control de facturación.
 */
CREATE OR REPLACE FUNCTION public.tiene_feature(clave text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = security.current_negocio_id() AND n.plan_id IS NOT NULL
    ) THEN true
    ELSE coalesce(public.reglas_plan() -> 'features' ? clave, false)
  END;
$function$;

/** Límite numérico del plan. NULL = sin tope (o sin plan asignado). */
CREATE OR REPLACE FUNCTION public.limite_plan(clave text)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT nullif(public.reglas_plan() ->> clave, 'null')::int;
$function$;

GRANT EXECUTE ON FUNCTION public.reglas_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiene_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.limite_plan(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Límite de usuarios, aplicado en la base
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_limite_usuarios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_max      int;
    v_actuales int;
    v_pendientes int;
BEGIN
    SELECT nullif(p.reglas ->> 'max_usuarios', 'null')::int
    INTO v_max
    FROM public.negocios n
    JOIN public.planes p ON p.id = n.plan_id
    WHERE n.id = NEW.negocio_id;

    -- Sin plan cargado no se limita: ver el comentario de tiene_feature().
    IF v_max IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_actuales
    FROM public.usuarios_negocios WHERE negocio_id = NEW.negocio_id;

    -- Las invitaciones pendientes ya ocupan un lugar: si no, se invita a diez
    -- y el tope se descubre recién cuando aceptan.
    SELECT count(*) INTO v_pendientes
    FROM public.invitaciones
    WHERE negocio_id = NEW.negocio_id AND estado = 'PENDIENTE';

    IF TG_TABLE_NAME = 'usuarios_negocios' THEN
      -- Al aceptar una invitación, esa invitación ya dejó de estar pendiente.
      IF v_actuales >= v_max THEN
        RAISE EXCEPTION 'El plan del negocio permite % usuario(s) y ya están todos ocupados.', v_max
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF v_actuales + v_pendientes >= v_max THEN
        RAISE EXCEPTION 'El plan del negocio permite % usuario(s), contando las invitaciones pendientes.', v_max
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_limite_usuarios ON public.usuarios_negocios;
CREATE TRIGGER trg_limite_usuarios
    BEFORE INSERT ON public.usuarios_negocios
    FOR EACH ROW EXECUTE FUNCTION public.validar_limite_usuarios();

DROP TRIGGER IF EXISTS trg_limite_invitaciones ON public.invitaciones;
CREATE TRIGGER trg_limite_invitaciones
    BEFORE INSERT ON public.invitaciones
    FOR EACH ROW EXECUTE FUNCTION public.validar_limite_usuarios();
