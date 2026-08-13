-- Onboarding self-service: plan de prueba, datos de segmentación y baja del
-- formulario de leads.
--
-- Reemplaza la decisión de 20260812180000 (elegir plan en el alta). Elegir plan
-- cuando todavía no vio el producto es una decisión sin consecuencia: el trial
-- desbloquea todo igual. Ahora se asigna solo un plan "Prueba" y los planes
-- pagos se muestran cuando la prueba está por vencer, que es cuando ya hay algo
-- que comparar. `/admincomerz` ya calcula `enPrueba` y `porVencer`, así que la
-- señal para ese momento ya existe.

-- ---------------------------------------------------------------------------
-- 1. El plan de prueba.
--
-- `activo = false` a propósito: es lo que hace que NO aparezca en ningún
-- selector de planes (todos filtran por activo). Se asigna solo, nunca se
-- elige. Sus reglas son las del plan más completo — el trial desbloquea todo,
-- que es justamente lo que se quiere mostrar.
-- ---------------------------------------------------------------------------
insert into public.planes (nombre, precio_mensual, activo, orden, descripcion, reglas)
select
  'Prueba',
  0,
  false,
  0,
  'Todo desbloqueado por 14 días. Al terminar se elige un plan.',
  reglas
from public.planes
where activo
  -- Idempotente sin depender de un unique en `nombre`, que no existe.
  and not exists (select 1 from public.planes where nombre = 'Prueba')
order by precio_mensual desc
limit 1;

-- ---------------------------------------------------------------------------
-- 2. Datos de segmentación del alta.
--
-- Van en `negocios` y no en `configuracion_pos` porque son datos de la
-- PLATAFORMA —para saber a quién le estás vendiendo, y se leen desde
-- /admincomerz— no configuración operativa del POS. Además sobreviven a un
-- reset de la config.
--
-- OJO con `rubro_comercial`: NO es `configuracion_pos.rubro`. Ese tiene un
-- CHECK de ('indumentaria','electro') y decide cómo se muestra la identidad
-- del producto en Inventario (N variantes vs. modelo+EAN). Este es comercial y
-- tiene 14 valores. El operativo se DERIVA de este en el alta y después queda
-- editable en Configuración: lo que contestó en el formulario es un default,
-- no una condena.
-- ---------------------------------------------------------------------------
alter table public.negocios
  add column if not exists rubro_comercial text,
  add column if not exists tamano_equipo text;

comment on column public.negocios.rubro_comercial is
  'Rubro comercial declarado en el alta (14 valores, ver shared/lib/rubros.ts). Segmentación, NO confundir con configuracion_pos.rubro, que es operativo y tiene 2 valores.';
comment on column public.negocios.tamano_equipo is
  'Cuánta gente trabaja en el comercio, declarado en el alta: solo_yo | 2_a_5 | 6_a_10 | mas_de_10.';

grant select, insert, update (rubro_comercial) on public.negocios to authenticated;
grant select, insert, update (tamano_equipo) on public.negocios to authenticated;

-- ---------------------------------------------------------------------------
-- 3. La RPC de alta, con todo lo del onboarding en UNA transacción.
--
-- Que sea atómico importa: si el negocio se crea y la config no, queda un
-- comercio sin `posName` ni método de pago, o sea inusable, y el usuario ya
-- está adentro sin forma de arreglarlo.
--
-- El plan ya no se elige: siempre arranca en 'Prueba' con 14 días.
--
-- SE DROPEAN LAS DOS FIRMAS VIEJAS, y esto es un arreglo, no limpieza. En
-- 20260812180000 se agregó `p_plan_id uuid default null` con `create or
-- replace`: eso NO reemplaza, crea una SOBRECARGA. Quedaron conviviendo
-- (text,text,text) y (text,text,text,uuid), y una llamada con los 3 argumentos
-- de siempre pasó a ser ambigua:
--
--   function crear_negocio_con_owner(a => unknown, b => unknown, c => unknown)
--   is not unique
--
-- O sea que crear un negocio quedó roto desde ayer. No lo notó nadie porque el
-- único camino a esa RPC era /crear-negocio, y el middleware de entonces
-- rebotaba a /auth a quien no tuviera negocio — pero habría explotado justo al
-- abrir el alta self-service. Verificado: 0 negocios creados en esa ventana.
--
-- Moraleja para la próxima: agregarle un parámetro con default a una función
-- existente no es una edición, es una función nueva.
-- ---------------------------------------------------------------------------
drop function if exists public.crear_negocio_con_owner(text, text, text);
drop function if exists public.crear_negocio_con_owner(text, text, text, uuid);

create or replace function public.crear_negocio_con_owner(
  p_nombre text,
  p_slug text,
  p_whatsapp text,
  p_rubro_comercial text default null,
  p_tamano_equipo text default null,
  -- Operativo ('indumentaria' | 'electro'), derivado del comercial en Node —
  -- mismo criterio que la canonicalización de atributos: la traducción se
  -- queda del lado de la app, la base recibe el valor ya resuelto.
  p_rubro text default 'indumentaria',
  p_razon_social text default null,
  p_cuit text default null,
  p_condicion_iva text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_user      uuid := auth.uid();
    v_negocio   uuid;
    v_rol_admin uuid;
    v_plan      uuid;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesión para crear un negocio';
    END IF;

    SELECT id INTO v_plan FROM public.planes WHERE nombre = 'Prueba';

    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'No existe el plan de prueba';
    END IF;

    INSERT INTO public.negocios (
      nombre, slug, estado, plan_id, plan_vencimiento,
      rubro_comercial, tamano_equipo
    )
    VALUES (
      p_nombre, p_slug, 'activo', v_plan, now() + interval '14 days',
      p_rubro_comercial, p_tamano_equipo
    )
    RETURNING id INTO v_negocio;

    INSERT INTO public.roles (nombre, negocio_id, es_sistema)
    VALUES ('ADMIN', v_negocio, true),
           ('ENCARGADO', v_negocio, true),
           ('VENDEDOR', v_negocio, true);

    SELECT id INTO v_rol_admin FROM public.roles
    WHERE negocio_id = v_negocio AND nombre = 'ADMIN';

    -- Todas las filas de `permisos`: es lo que hace que un permiso nuevo
    -- llegue solo a los negocios nuevos.
    INSERT INTO public.rol_permisos (rol_id, permiso_id, negocio_id)
    SELECT v_rol_admin, p.id, v_negocio FROM public.permisos p;

    INSERT INTO public.configuracion_pos (
      negocio_id, "posName", whatsapp, rubro,
      razon_social, cuit, condicion_iva
    )
    VALUES (
      v_negocio, p_nombre, p_whatsapp,
      CASE WHEN p_rubro = 'electro' THEN 'electro' ELSE 'indumentaria' END,
      nullif(btrim(coalesce(p_razon_social, '')), ''),
      nullif(btrim(coalesce(p_cuit, '')), ''),
      nullif(btrim(coalesce(p_condicion_iva, '')), '')
    );

    INSERT INTO public.metodos_pago (negocio_id, nombre, tipo)
    VALUES (v_negocio, 'Efectivo', 'EFECTIVO');

    INSERT INTO public.usuarios_negocios (usuario_id, negocio_id, rol_id, rol, es_owner)
    VALUES (v_user, v_negocio, v_rol_admin, 'ADMIN', true);

    RETURN v_negocio;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Baja del formulario de leads.
--
-- Con el alta self-service, `solicitudes_comercio` deja de tener camino: el que
-- quiere Comerz se registra y entra. Se ARCHIVA en vez de dropearse, siguiendo
-- el precedente de 20260812025139 (archivar_backups_broderie): sale de `public`
-- —sin RLS que auditar, sin GRANT a anon, fuera del alcance de PostgREST— pero
-- las filas quedan. Una de las dos es Ninja Camisetas, hoy cliente real.
-- ---------------------------------------------------------------------------
create schema if not exists archivo;
revoke all on schema archivo from anon, authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'solicitudes_comercio'
  ) then
    alter table public.solicitudes_comercio set schema archivo;
  end if;
end $$;
