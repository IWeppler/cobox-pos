-- invitaciones.negocio_id quedó sin DEFAULT, a diferencia del resto de las
-- tablas del negocio: un INSERT que no lo mandaba explícito guardaba NULL y
-- rebotaba contra su propio WITH CHECK con
-- "new row violates row-level security policy for table invitaciones".
ALTER TABLE public.invitaciones
    ALTER COLUMN negocio_id SET DEFAULT security.current_negocio_id();
