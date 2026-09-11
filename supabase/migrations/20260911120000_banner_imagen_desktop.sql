-- Banner del catálogo: una imagen para mobile y otra, opcional, para desktop.
--
-- El hero pasó a ocupar 90dvh de alto en pantallas grandes, y una foto pensada
-- para un recuadro de 16/12 en un celular no sobrevive a ese recorte: en
-- desktop se ve el centro ampliado y el texto de la promo queda afuera.
--
-- `banner_imagen` sigue siendo la única obligatoria y es la que se sirve si no
-- hay otra. NULL acá significa "usá la de siempre en las dos", que es el
-- estado de los 4 negocios hoy: es un valor con significado, no un dato que
-- falte, por eso no hay default ni backfill.
alter table public.configuracion_pos
  add column if not exists banner_imagen_desktop text;

comment on column public.configuracion_pos.banner_imagen_desktop is
  'Banner del catálogo para pantallas >= 640px. NULL = se usa banner_imagen en todos los tamaños. La de mobile es la obligatoria.';

-- Los permisos de esta tabla son POR COLUMNA (anon lee el branding público y
-- nada de la identidad fiscal ni de la política de crédito), así que una
-- columna nueva nace sin ningún grant: sin estas dos líneas el catálogo
-- público no la vería y el panel no la podría guardar.
grant select (banner_imagen_desktop) on public.configuracion_pos to anon;
grant select (banner_imagen_desktop), insert (banner_imagen_desktop), update (banner_imagen_desktop)
  on public.configuracion_pos to authenticated;

do $$
begin
  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'configuracion_pos'
      and column_name = 'banner_imagen_desktop'
      and grantee = 'anon'
      and privilege_type = 'SELECT'
  ) then
    raise exception 'anon no puede leer banner_imagen_desktop: el catálogo público no vería el banner de desktop';
  end if;
end $$;
