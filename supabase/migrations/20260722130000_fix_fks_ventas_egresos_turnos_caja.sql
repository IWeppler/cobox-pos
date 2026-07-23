-- Replica FKs y columna faltantes en el bootstrap de este proyecto (perdidas
-- respecto de prod), necesarias para los selects embebidos "perfiles(nombre)"
-- que usa app/(dashboard)/caja/page.tsx sobre ventas, egresos y turnos_caja.

ALTER TABLE public.egresos
  ADD COLUMN turno_caja_id uuid;

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_vendedor_id_fkey
  FOREIGN KEY (vendedor_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;

ALTER TABLE public.egresos
  ADD CONSTRAINT egresos_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;

ALTER TABLE public.egresos
  ADD CONSTRAINT egresos_turno_caja_id_fkey
  FOREIGN KEY (turno_caja_id) REFERENCES public.turnos_caja(id);

ALTER TABLE public.turnos_caja
  ADD CONSTRAINT turnos_caja_abierta_por_fkey
  FOREIGN KEY (abierta_por) REFERENCES auth.users(id);

ALTER TABLE public.turnos_caja
  ADD CONSTRAINT turnos_caja_cerrada_por_fkey
  FOREIGN KEY (cerrada_por) REFERENCES auth.users(id);

ALTER TABLE public.turnos_caja
  ADD CONSTRAINT turnos_caja_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES auth.users(id);

ALTER TABLE public.turnos_caja
  ADD CONSTRAINT turnos_caja_vendedor_id_fkey
  FOREIGN KEY (vendedor_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;
