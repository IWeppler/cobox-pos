-- Las policies RESTRICTIVE llaman security.same_negocio() y se evalúan con los
-- privilegios del rol que consulta: sin USAGE/EXECUTE, authenticated recibe
-- 42501 permission denied for schema security en cada query.
GRANT USAGE ON SCHEMA security TO authenticated;
GRANT EXECUTE ON FUNCTION security.same_negocio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION security.current_negocio_id() TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION security.current_user_id() TO authenticated;
