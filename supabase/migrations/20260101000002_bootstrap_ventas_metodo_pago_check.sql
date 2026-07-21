-- Bootstrap histórico: este constraint existía en prod desde el esquema
-- inicial (creado a mano, nunca quedó capturado en una migración) con el
-- set original de métodos de pago. 20260717210939 lo reemplaza (DROP +
-- ADD) para sumar PAGO_MIXTO y CUENTA_CORRIENTE.
ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_metodo_pago_check
  CHECK (metodo_pago = ANY (ARRAY['EFECTIVO'::text, 'TRANSFERENCIA'::text, 'TARJETA'::text]));
