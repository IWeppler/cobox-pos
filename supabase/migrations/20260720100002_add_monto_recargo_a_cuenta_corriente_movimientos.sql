ALTER TABLE public.cuenta_corriente_movimientos
  ADD COLUMN monto_recargo numeric(12,2) NOT NULL DEFAULT 0;
