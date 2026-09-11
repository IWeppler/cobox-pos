-- El punto de interés de cada banner, para que el recorte no se coma lo que
-- importa.
--
-- El hero es `object-cover`: la imagen llena el marco y lo que sobra se
-- RECORTA, desde el centro. Con dos formas muy distintas —16/12 en el celular
-- y 90dvh de alto en desktop— una foto encuadrada para una se rompe en la
-- otra, y la cara o el cartel de la promo quedan afuera. Hasta acá el comercio
-- no tenía ninguna forma de decir qué parte no se puede perder.
--
-- POR QUÉ UN PUNTO Y NO UN RECORTE DE VERDAD. Recortar generaría una imagen
-- nueva por cada forma, con dos costos: se pierde resolución (ya se re-encodea
-- una vez) y el recorte queda CONGELADO, así que el día que cambie el alto del
-- hero hay que volver a pedirle a cada comercio que recorte de nuevo. El punto
-- es no destructivo, se aplica igual a las dos formas al mismo tiempo y sale
-- como un `object-position` de CSS: una sola imagen, bien encuadrada en las
-- dos. Es además lo que ya entiende el navegador, sin canvas ni re-subida.
--
-- NULL = centrado, que es el default de CSS y lo que hacen hoy los 10
-- negocios. No es "no se sabe": es "nadie lo movió y está bien así". Por eso
-- no hay DEFAULT 50 ni backfill — escribir 50 en todas las filas perdería la
-- diferencia entre encuadrado a mano y nunca tocado.
--
-- Cada imagen tiene el suyo: la de mobile y la de desktop son fotos distintas
-- (ver `banner_imagen_desktop`, 20260911120000) y no tienen por qué compartir
-- el punto de interés.
alter table public.configuracion_pos
  add column if not exists banner_focal_x smallint,
  add column if not exists banner_focal_y smallint,
  add column if not exists banner_focal_desktop_x smallint,
  add column if not exists banner_focal_desktop_y smallint;

-- Porcentajes, como los toma `object-position`. El CHECK es el freno real: el
-- espejo amable está en `shared/lib/foco-banner.ts`, que además es el que
-- convierte el par a la cadena de CSS — el valor NUNCA se guarda ya formateado
-- para que nada de lo que escribió un cliente termine dentro de un `style`.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'configuracion_pos_focal_rango'
  ) then
    alter table public.configuracion_pos
      add constraint configuracion_pos_focal_rango check (
        (banner_focal_x is null or banner_focal_x between 0 and 100) and
        (banner_focal_y is null or banner_focal_y between 0 and 100) and
        (banner_focal_desktop_x is null or banner_focal_desktop_x between 0 and 100) and
        (banner_focal_desktop_y is null or banner_focal_desktop_y between 0 and 100)
      );
  end if;
end $$;

comment on column public.configuracion_pos.banner_focal_x is
  'Punto de interés horizontal del banner de mobile, 0-100 (%). NULL = centrado.';
comment on column public.configuracion_pos.banner_focal_y is
  'Punto de interés vertical del banner de mobile, 0-100 (%). NULL = centrado.';
comment on column public.configuracion_pos.banner_focal_desktop_x is
  'Punto de interés horizontal del banner de desktop, 0-100 (%). NULL = centrado.';
comment on column public.configuracion_pos.banner_focal_desktop_y is
  'Punto de interés vertical del banner de desktop, 0-100 (%). NULL = centrado.';

-- Los permisos de esta tabla son POR COLUMNA (anon ve el branding público y
-- nada de la identidad fiscal), así que una columna nueva nace sin ningún
-- grant: sin esto el catálogo público no vería el encuadre y seguiría
-- recortando desde el centro.
grant select (banner_focal_x, banner_focal_y, banner_focal_desktop_x, banner_focal_desktop_y)
  on public.configuracion_pos to anon;
grant select (banner_focal_x, banner_focal_y, banner_focal_desktop_x, banner_focal_desktop_y),
      insert (banner_focal_x, banner_focal_y, banner_focal_desktop_x, banner_focal_desktop_y),
      update (banner_focal_x, banner_focal_y, banner_focal_desktop_x, banner_focal_desktop_y)
  on public.configuracion_pos to authenticated;

do $$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
  from unnest(array[
    'banner_focal_x','banner_focal_y',
    'banner_focal_desktop_x','banner_focal_desktop_y'
  ]) as col
  where not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'configuracion_pos'
      and column_name = col
      and grantee = 'anon'
      and privilege_type = 'SELECT'
  );

  if v_faltan > 0 then
    raise exception 'anon no puede leer % columna(s) de foco: el catálogo público seguiría recortando desde el centro', v_faltan;
  end if;
end $$;
