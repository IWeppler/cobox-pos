-- calcular_egresos_turno se creó directo en prod (Evens) en algún momento
-- y nunca quedó versionada en el repo — esta migración solo la deja
-- registrada, con la definición real tomada de pg_get_functiondef en
-- Evens. CREATE OR REPLACE es no-op acá (ya existe idéntica), pero deja
-- el registro en supabase_migrations.schema_migrations.
CREATE OR REPLACE FUNCTION public.calcular_egresos_turno(p_turno_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE turno_caja_id = p_turno_id;
$function$;
