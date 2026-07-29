-- Cuarta pasada de la auditoría prod vs repo, ahora hecha contra un proyecto
-- nuevo ya pusheado (click-project) en vez de contra la base vacía. Con las
-- 54 migraciones aplicadas el diff quedó en: 34/34 tablas, 34/34 con RLS,
-- 85 políticas con hash idéntico, 339 columnas. Sobrevivieron tres gaps.
--
-- Todo idempotente: se puede correr en Evens (donde es casi todo no-op),
-- en Estilo Bonito y en cualquier proyecto nuevo.

-- ---------------------------------------------------------------------------
-- 1. configuracion_pos: posName / posLogo perdieron el camelCase
-- ---------------------------------------------------------------------------
-- esquema_maestro.sql los declara sin comillas, así que Postgres los pliega a
-- `posname` / `poslogo`. Evens tiene los originales en camelCase porque la
-- tabla nació antes que el archivo de bootstrap. PostgREST es sensible a
-- mayúsculas y el código pide camelCase (entities/config/types.ts,
-- features/config/actions/config-actions.ts, shared/components/navbar.tsx,
-- app/layout.tsx, entre otros), así que en un proyecto nuevo la config del POS
-- y del catálogo llegaba vacía sin ningún error visible.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='configuracion_pos'
      AND column_name='posname'
  ) THEN
    ALTER TABLE public.configuracion_pos RENAME COLUMN posname TO "posName";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='configuracion_pos'
      AND column_name='poslogo'
  ) THEN
    ALTER TABLE public.configuracion_pos RENAME COLUMN poslogo TO "posLogo";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Turno cerrado inmutable: función + trigger que solo existían en prod
-- ---------------------------------------------------------------------------
-- La regla "turno cerrado es inmutable para todos" (CLAUDE.md) la sostiene
-- este trigger, no la RLS: `turnos_caja_update_propio` deja pasar el UPDATE
-- del dueño del turno. Sin el trigger, un vendedor reabre y edita su propio
-- turno ya cerrado.

CREATE OR REPLACE FUNCTION public.bloquear_edicion_turno_cerrado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.estado = 'CERRADO' THEN
    RAISE EXCEPTION 'No se puede modificar un turno de caja ya cerrado (id: %).', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bloquear_edicion_turno_cerrado ON public.turnos_caja;
CREATE TRIGGER trg_bloquear_edicion_turno_cerrado
  BEFORE UPDATE ON public.turnos_caja
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicion_turno_cerrado();

-- ---------------------------------------------------------------------------
-- 3. handle_new_user: se replica por paridad, pero OJO
-- ---------------------------------------------------------------------------
-- En Evens la función existe pero está huérfana: no hay ningún trigger no
-- interno en el schema `auth` que la dispare (verificado en pg_trigger). O sea
-- que hoy en prod los perfiles NO se crean por acá. Se replica para que los
-- proyectos queden iguales, y a propósito SIN crear el trigger sobre
-- auth.users: agregarlo cambiaría el comportamiento de alta de usuarios
-- respecto de Evens, que es justo lo que esta migración no debe hacer.
-- Decidir aparte si el alta de perfiles se cablea acá o queda en la app.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    -- Usa el nombre que le pasemos, o la primera parte del email si no tiene
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    -- Por defecto todos nacen como VENDEDOR, a menos que le digamos lo contrario
    coalesce(new.raw_user_meta_data->>'rol', 'VENDEDOR')
  );
  return new;
end;
$function$;
