-- Borra las columnas deprecadas de perfiles: la pertenencia y el rol viven en
-- usuarios_negocios desde la migración de identidad multi-negocio.
--
-- ⚠ APLICAR SOLO CON EL DEPLOY YA VERDE. El código desplegado antes de esta
-- tanda lee perfiles.rol en el middleware y en los gates de página; si estas
-- columnas desaparecen antes de que ese deploy salga, la app se cae para las
-- cuentas que están vendiendo. Orden correcto: push -> deploy verde -> esta
-- migración -> smoke test.
--
-- No hay pérdida de datos: rol y rol_id ya están backfilleados en
-- usuarios_negocios, y negocio_id se reemplazó por la membresía.

-- Red de seguridad: deja el estado anterior guardado por si hay que volver.
CREATE TABLE IF NOT EXISTS public._backup_perfiles_deprecado_20260802 AS
SELECT id, rol, rol_id, negocio_id FROM public.perfiles;

ALTER TABLE public.perfiles DROP COLUMN IF EXISTS rol;
ALTER TABLE public.perfiles DROP COLUMN IF EXISTS rol_id;
ALTER TABLE public.perfiles DROP COLUMN IF EXISTS negocio_id;
