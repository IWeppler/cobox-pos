CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_vendedor_abierto_unico
ON public.turnos_caja (vendedor_id)
WHERE estado = 'ABIERTO';
