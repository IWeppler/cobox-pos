-- Última columna faltante detectada en la auditoría completa prod vs
-- este proyecto: bajas.origen (MANUAL/DEVOLUCION_VENTA), sin CHECK en prod.
ALTER TABLE public.bajas
  ADD COLUMN origen text NOT NULL DEFAULT 'MANUAL';
