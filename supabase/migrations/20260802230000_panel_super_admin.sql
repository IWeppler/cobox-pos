-- Panel de super admin de Comerz.
--
-- 1. El super admin no pertenece a ningún negocio, así que las policies de
--    usuarios_negocios y perfiles no le dejaban ver quién es el dueño de cada
--    comercio: el listado salía sin dueños.
-- 2. Para medir churn hace falta saber CUÁNDO se dio de baja un negocio.
--    `estado` solo dice el estado actual, no desde cuándo.

DROP POLICY IF EXISTS usuarios_negocios_select_super_admin ON public.usuarios_negocios;
CREATE POLICY usuarios_negocios_select_super_admin ON public.usuarios_negocios
    FOR SELECT TO authenticated
    USING (security.is_super_admin());

-- perfiles tiene una policy RESTRICTIVE: hay que ampliarla, no agregar otra
-- permissive (las restrictivas se combinan con AND y bloquearían igual).
DROP POLICY IF EXISTS aislamiento_negocio ON public.perfiles;
CREATE POLICY aislamiento_negocio ON public.perfiles
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (
      id = auth.uid()
      OR security.comparte_negocio(id)
      OR security.is_super_admin()
    )
    WITH CHECK (
      id = auth.uid()
      OR security.comparte_negocio(id)
      OR security.is_super_admin()
    );

-- Sólo el super admin toca planes y estado de un negocio: es facturación,
-- no configuración del comercio.
DROP POLICY IF EXISTS negocios_update_super_admin ON public.negocios;
CREATE POLICY negocios_update_super_admin ON public.negocios
    FOR UPDATE TO authenticated
    USING (security.is_super_admin())
    WITH CHECK (security.is_super_admin());

ALTER TABLE public.negocios
    ADD COLUMN IF NOT EXISTS estado_cambiado_en timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.negocios.estado_cambiado_en IS
  'Cuándo pasó a su estado actual. Sin esto el churn no se puede acotar a un período.';

CREATE OR REPLACE FUNCTION public.marcar_cambio_de_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.estado_cambiado_en := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_negocios_estado_cambiado ON public.negocios;
CREATE TRIGGER trg_negocios_estado_cambiado
    BEFORE UPDATE ON public.negocios
    FOR EACH ROW EXECUTE FUNCTION public.marcar_cambio_de_estado();
