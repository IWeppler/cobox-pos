ALTER TABLE public.configuracion_pos
  ADD COLUMN entrega_minima_bloqueante boolean NOT NULL DEFAULT false;

ALTER TABLE public.clientes
  ADD COLUMN exceptuado_entrega_minima boolean NOT NULL DEFAULT false;
