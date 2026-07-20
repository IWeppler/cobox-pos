ALTER TABLE public.configuracion_pos
  ADD COLUMN recargo_mora_tipo text NOT NULL DEFAULT 'NINGUNO',
  ADD COLUMN recargo_mora_valor numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.configuracion_pos
  ADD CONSTRAINT configuracion_pos_recargo_mora_tipo_check
  CHECK (recargo_mora_tipo = ANY (ARRAY['NINGUNO'::text, 'MONTO_FIJO'::text, 'PORCENTAJE'::text]));
