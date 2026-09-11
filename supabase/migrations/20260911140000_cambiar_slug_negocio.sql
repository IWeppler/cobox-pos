-- La dirección web de la tienda, editable por el dueño desde Configuración.
--
-- Hasta acá el slug se derivaba del nombre al crear el negocio
-- (`crear_negocio_con_owner`) y no había NINGÚN camino para cambiarlo: la única
-- policy de UPDATE sobre `negocios` es `negocios_update_super_admin`. Un
-- comercio que se equivocó de nombre al registrarse, o que cambió de marca,
-- quedaba con esa URL para siempre.
--
-- Por qué una función y no una policy de UPDATE para ADMIN: la RLS es por FILA,
-- no por columna. Una policy que deje al dueño escribir su fila de `negocios`
-- le deja escribir TAMBIÉN `estado`, `plan_id` y `plan_vencimiento` — o sea
-- darse el plan que quiera desde la consola del navegador, sin pasar por ningún
-- server action. Es exactamente lo que midió `20260905120000` sobre
-- `configuracion_pos`. La función escribe UNA columna y nada más.
--
-- SECURITY DEFINER, y lo que la acota es que NO RECIBE EL NEGOCIO: sale de
-- `security.current_negocio_id()`, que ya valida la cookie contra
-- `usuarios_negocios`. Mismo criterio que `registrar_paso_onboarding`. No hay
-- un `negocio_id` que filtrar porque no hay uno que el llamador pueda elegir.
create or replace function public.cambiar_slug_negocio(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio uuid;
  v_slug    text;
begin
  v_negocio := security.current_negocio_id();
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  -- La dirección de la tienda es identidad del comercio, no una preferencia de
  -- pantalla: la cambia quien es dueño, no quien atiende el mostrador.
  if not public.is_admin() then
    raise exception 'SOLO_ADMIN';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));

  -- Los dos CHECK de `negocios` (20260811130000) frenan lo mismo; estas
  -- excepciones existen para que la pantalla pueda decir QUÉ está mal en vez de
  -- mostrar un 23514. El espejo en TypeScript es `slug-negocio.ts`.
  if v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     or char_length(v_slug) < 3
     or char_length(v_slug) > 30 then
    raise exception 'SLUG_INVALIDO';
  end if;

  if v_slug = any (array[
    'app','www','admin','api','mail','status','support','help',
    'blog','docs','cdn','static','assets','auth','login'
  ]) then
    raise exception 'SLUG_RESERVADO';
  end if;

  -- Sin cambio no se escribe: así el `not found` de abajo significa de verdad
  -- "no se pudo", y no "pediste lo que ya tenías".
  if exists (select 1 from public.negocios where id = v_negocio and slug = v_slug) then
    return v_slug;
  end if;

  update public.negocios set slug = v_slug where id = v_negocio;

  if not found then
    raise exception 'NEGOCIO_NO_ENCONTRADO';
  end if;

  return v_slug;
exception
  -- El unique global de `negocios.slug`: la dirección ya es de otro comercio.
  when unique_violation then
    raise exception 'SLUG_OCUPADO';
end;
$$;

comment on function public.cambiar_slug_negocio(text) is
  'Cambia la dirección web del negocio ACTIVO (la del catálogo público). Solo ADMIN. No recibe negocio_id a propósito: sale de security.current_negocio_id().';

revoke all on function public.cambiar_slug_negocio(text) from public, anon;
grant execute on function public.cambiar_slug_negocio(text) to authenticated;

-- Guard: si alguien reescribe el cuerpo y se lleva puesto el corte por rol,
-- cualquier vendedora podría renombrar la tienda del comercio. Mismo criterio
-- que el guard de `20260904140000` sobre `aprobar_orden_compra`.
do $$
declare
  v_def text := pg_get_functiondef('public.cambiar_slug_negocio(text)'::regprocedure);
begin
  if position('is_admin()' in v_def) = 0 then
    raise exception 'cambiar_slug_negocio quedó sin el chequeo de ADMIN';
  end if;
  if position('current_negocio_id()' in v_def) = 0 then
    raise exception 'cambiar_slug_negocio quedó sin resolver el negocio por la sesión';
  end if;
end $$;
