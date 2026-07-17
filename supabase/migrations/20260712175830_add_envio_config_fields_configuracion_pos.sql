ALTER TABLE public.configuracion_pos
  ADD COLUMN envio_costo_local numeric NULL,
  ADD COLUMN envio_mensaje_lejos text NULL DEFAULT 'Envío a convenir — te contactamos por WhatsApp para coordinar',
  ADD COLUMN localidad_negocio text NULL;
