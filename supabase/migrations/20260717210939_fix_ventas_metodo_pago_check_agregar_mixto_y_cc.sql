ALTER TABLE public.ventas DROP CONSTRAINT ventas_metodo_pago_check;

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_metodo_pago_check
  CHECK (metodo_pago = ANY (ARRAY['EFECTIVO'::text, 'TRANSFERENCIA'::text, 'TARJETA'::text, 'PAGO_MIXTO'::text, 'CUENTA_CORRIENTE'::text]));
