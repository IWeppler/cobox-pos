-- El selector de negocios mostraba "Negocio" en vez del nombre real de los
-- negocios que NO son el activo: la única policy de SELECT para authenticated
-- era `id = security.current_negocio_id()`, así que el embed
-- usuarios_negocios -> negocios volvía null para todas las otras membresías.
--
-- Se puede ver el nombre de un negocio al que pertenecés: es lo mínimo para
-- poder elegirlo. No reemplaza a negocios_select_propio (que sigue cubriendo el
-- caso del negocio activo) ni afecta el aislamiento de datos: esto es la tabla
-- de negocios, no la operación.
create policy negocios_select_membresia
  on public.negocios
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios_negocios un
      where un.negocio_id = negocios.id
        and un.usuario_id = auth.uid()
    )
  );
