-- Columna perdida en el bootstrap de este proyecto: bloqueaba anularVentaAction
-- con PGRST204 ("Could not find the 'motivo_anulacion' column").
ALTER TABLE public.ventas
  ADD COLUMN motivo_anulacion text;
