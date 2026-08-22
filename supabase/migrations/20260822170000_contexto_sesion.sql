-- Rol + super admin + negocio activo en UNA sola llamada.
--
-- POR QUÉ: el middleware corre en CADA request del panel —cada navegación,
-- cada prefetch RSC, cada server action— y hacía tres viajes seguidos a la
-- base: `auth.getUser()`, `rol_actual()` y `is_super_admin()`. Medido sobre una
-- venta real de Ninja Camisetas el 22/8/2026, esos viajes se comían 543 ms de
-- los 1.048 ms totales: más de la mitad del tiempo se iba ANTES de que
-- `create-sale` empezara a trabajar.
--
-- Y es un costo que NO arregla mover las funciones de región: el middleware
-- corre en el runtime edge, siempre cerca del usuario y siempre lejos de la
-- base. Lo único que se puede hacer es ir menos veces.
--
-- Esta función no agrega ningún acceso: compone las dos que ya existían y que
-- `authenticated` ya podía llamar por separado. Mismo resultado, un viaje en
-- vez de dos.
--
-- Es ADITIVA: mientras el código desplegado siga llamando a `rol_actual` e
-- `is_super_admin` por separado, esto no cambia nada. Por eso va ANTES del
-- deploy y no después.

create or replace function public.contexto_sesion()
returns table (
  rol text,
  es_super_admin boolean,
  negocio_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    public.rol_actual(),
    security.is_super_admin(),
    security.current_negocio_id();
$$;

comment on function public.contexto_sesion() is
  'Rol en el negocio activo + si es super admin + negocio activo, en un solo '
  'round-trip. Para el middleware, que corre en cada request. No amplía '
  'permisos: compone rol_actual() e is_super_admin(), que ya eran públicas '
  'para authenticated.';

grant execute on function public.contexto_sesion() to authenticated;
