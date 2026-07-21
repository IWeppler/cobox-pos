ALTER TABLE public.cuenta_corriente_movimientos
  ADD COLUMN anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN anulado_en timestamptz,
  ADD COLUMN anulado_por uuid;

ALTER TABLE public.cuenta_corriente_movimientos
  ADD CONSTRAINT cuenta_corriente_movimientos_anulado_por_fkey
  FOREIGN KEY (anulado_por) REFERENCES auth.users(id);
