-- Normalización de planes + grandfathering + tope de productos.
--
-- Tres cosas que van juntas porque la tercera rompe a la segunda si van
-- separadas: se bajan límites de Emprendedor (clientes de cuenta corriente de
-- 75 a 50) y se agrega uno nuevo (1000 productos), así que los comercios que
-- ya están adentro necesitan conservar lo suyo ANTES de que los límites nuevos
-- entren en vigor.

-- ---------------------------------------------------------------------------
-- 1. Override por negocio.
--
-- Es la pieza del grandfathering: las condiciones de un comercio son las de su
-- plan MÁS lo que se le haya prometido aparte. Se eligió esto en vez de
-- duplicar planes en "legacy" porque un plan congelado se pudre — cada mejora
-- futura hay que hacerla dos veces o los viejos quedan atrás — y porque el
-- caso "a este cliente le prometimos otra cosa" va a volver a pasar.
--
-- El merge es `||` de jsonb: shallow, y gana el override. Vacío = manda el
-- plan, que es el caso del 99%.
-- ---------------------------------------------------------------------------
alter table public.negocios
  add column if not exists reglas_override jsonb not null default '{}'::jsonb;

comment on column public.negocios.reglas_override is
  'Excepciones a las reglas del plan para ESTE negocio (grandfathering, acuerdos puntuales). Se mergea sobre planes.reglas; vacío = manda el plan. Ver reglas_negocio().';

-- Quién puede escribirla: NADIE salvo el super admin de Comerz, y eso ya está
-- resuelto por RLS — la única policy de UPDATE sobre `negocios` es
-- `negocios_update_super_admin`. No se agrega un revoke por columna porque
-- sería teatro: `authenticated` tiene UPDATE sobre la TABLA entera, y un
-- revoke de columna no le saca un privilegio de tabla. El freno real es la
-- policy, igual que con `plan_id` y `plan_vencimiento`, que viven en la misma
-- fila y con el mismo riesgo desde siempre.

-- ---------------------------------------------------------------------------
-- 2. reglas_negocio(uuid): las reglas EFECTIVAS de un negocio.
--
-- Existe como función aparte —y no solo dentro de reglas_plan()— porque los
-- triggers de límite validan sobre `NEW.negocio_id`, que no siempre es el
-- negocio activo de la sesión. Hasta acá cada trigger leía `p.reglas` por su
-- cuenta: con el override, esa lectura directa se saltearía el grandfathering
-- y les aplicaría los límites nuevos igual. Ahora hay una sola fuente.
-- ---------------------------------------------------------------------------
create or replace function public.reglas_negocio(p_negocio uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.reglas, '{}'::jsonb) || coalesce(n.reglas_override, '{}'::jsonb)
  from public.negocios n
  left join public.planes p on p.id = n.plan_id
  where n.id = p_negocio;
$$;

comment on function public.reglas_negocio is
  'Reglas efectivas del negocio: las del plan con negocios.reglas_override aplicado encima. Única fuente para límites y features.';

create or replace function public.reglas_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.reglas_negocio(security.current_negocio_id()), '{}'::jsonb);
$$;

grant execute on function public.reglas_negocio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Grandfathering, ANTES de tocar los planes.
--
-- El orden importa: si primero se bajaran los límites, habría una ventana en
-- la que Estilo Bonito (28 clientes fiados) queda con tope 50 y ClickTostado
-- con un tope de productos que no tenía.
--
-- Solo se congela lo que EMPEORA. Copiar todas las reglas al override sería
-- congelar también las mejoras futuras: si mañana Emprendedor pasa a 3
-- usuarios, estos comercios tienen que recibirlo.
--
-- `max_productos: null` es "sin límite" explícito, que es lo que tienen hoy —
-- y por eso el override lo dice en vez de omitirlo: omitirlo dejaría que el
-- 1000 del plan pasara por el merge.
-- ---------------------------------------------------------------------------
update public.negocios n
set reglas_override = n.reglas_override || jsonb_build_object(
  'max_clientes_cuenta_corriente', 75,
  'max_productos', null
)
from public.planes p
where p.id = n.plan_id
  and p.nombre = 'Emprendedor';

-- ---------------------------------------------------------------------------
-- 4. Las reglas nuevas de cada plan.
--
-- Se escriben completas (no con `||` sobre lo viejo) para que el archivo sea
-- la definición del plan y no un parche que hay que leer junto a los
-- anteriores.
--
-- Cambios respecto de lo que había:
-- - Emprendedor: cuenta corriente 75 -> 50, y aparece el tope de 1000
--   productos. Suma `insights_basico` y `resumen_semanal`, que ya se entregan.
-- - Gestión: suma `facturacion_electronica` (estaba solo en Empresa; es la
--   venta principal de ARCA y el comercio con empleados es el que factura) y
--   `catalogo_sin_marca`.
-- - Empresa: sin cambios de límites; suma las features nuevas por ser el plan
--   de arriba.
-- ---------------------------------------------------------------------------
update public.planes set reglas = jsonb_build_object(
  'max_usuarios', 1,
  'max_sucursales', 1,
  'max_clientes_cuenta_corriente', 50,
  'max_productos', 1000,
  'features', jsonb_build_array(
    'pos', 'caja', 'ventas', 'stock', 'catalogo_publico', 'clientes',
    'cuenta_corriente', 'tickets', 'historial_ventas',
    'insights_basico', 'resumen_semanal'
  )
) where nombre = 'Emprendedor';

update public.planes set reglas = jsonb_build_object(
  'max_usuarios', 5,
  'max_sucursales', 1,
  'max_clientes_cuenta_corriente', 250,
  'max_productos', null,
  'features', jsonb_build_array(
    'pos', 'caja', 'ventas', 'stock', 'catalogo_publico', 'clientes',
    'cuenta_corriente', 'tickets', 'historial_ventas',
    'insights_basico', 'resumen_semanal',
    'reportes', 'reportes_exportar', 'multicaja', 'roles', 'auditoria',
    'facturacion_electronica', 'catalogo_sin_marca'
  )
) where nombre = 'Gestión';

update public.planes set reglas = jsonb_build_object(
  'max_usuarios', 99,
  'max_sucursales', 10,
  'max_clientes_cuenta_corriente', null,
  'max_productos', null,
  'features', jsonb_build_array(
    'pos', 'caja', 'ventas', 'stock', 'catalogo_publico', 'clientes',
    'cuenta_corriente', 'cuenta_corriente_ilimitada', 'tickets',
    'historial_ventas', 'insights_basico', 'resumen_semanal',
    'reportes', 'reportes_exportar', 'multicaja', 'roles', 'auditoria',
    'facturacion_electronica', 'catalogo_sin_marca',
    'multisucursal', 'stock_por_sucursal', 'transferencias_sucursal',
    'dashboard_consolidado', 'permisos_avanzados', 'integraciones', 'api'
  )
) where nombre = 'Empresa';

-- La prueba desbloquea todo: se mantiene igual al plan más completo, con los
-- límites en null para que 14 días no tengan techo.
update public.planes set reglas = (
  select reglas || jsonb_build_object(
    'max_clientes_cuenta_corriente', null,
    'max_productos', null
  )
  from public.planes where nombre = 'Empresa'
) where nombre = 'Prueba';

-- ---------------------------------------------------------------------------
-- 5. Los triggers de límite pasan a leer las reglas EFECTIVAS.
--
-- Sin esto el override sería decorativo: los dos leían `p.reglas` derecho.
-- ---------------------------------------------------------------------------
create or replace function public.validar_limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_max        int;
    v_actuales   int;
    v_pendientes int;
BEGIN
    v_max := nullif(public.reglas_negocio(NEW.negocio_id) ->> 'max_usuarios', 'null')::int;

    IF v_max IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_actuales
    FROM public.usuarios_negocios WHERE negocio_id = NEW.negocio_id;

    SELECT count(*) INTO v_pendientes
    FROM public.invitaciones
    WHERE negocio_id = NEW.negocio_id AND estado = 'PENDIENTE';

    IF TG_TABLE_NAME = 'usuarios_negocios' THEN
      IF v_actuales >= v_max THEN
        RAISE EXCEPTION 'El plan del negocio permite % usuario(s) y ya están todos ocupados.', v_max
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF v_actuales + v_pendientes >= v_max THEN
        RAISE EXCEPTION 'El plan del negocio permite % usuario(s), contando las invitaciones pendientes.', v_max
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    RETURN NEW;
END;
$$;

create or replace function public.validar_limite_cuenta_corriente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_max      int;
    v_actuales int;
BEGIN
    IF NEW.saldo_pendiente IS NULL OR NEW.saldo_pendiente <= 0 THEN
      RETURN NEW;
    END IF;

    -- Un cliente que YA debía no vuelve a contar: el tope es de clientes con
    -- deuda abierta, no de movimientos. Esto es también lo que hace que cobrar
    -- o refinanciar nunca se frene por el plan (regla: no romper una operación
    -- en curso).
    IF TG_OP = 'UPDATE' AND OLD.saldo_pendiente > 0 THEN
      RETURN NEW;
    END IF;

    v_max := nullif(
      public.reglas_negocio(NEW.negocio_id) ->> 'max_clientes_cuenta_corriente',
      'null'
    )::int;

    IF v_max IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_actuales
    FROM public.clientes c
    WHERE c.negocio_id = NEW.negocio_id
      AND c.saldo_pendiente > 0
      AND c.id <> NEW.id;

    IF v_actuales >= v_max THEN
      RAISE EXCEPTION
        'El plan permite % cliente(s) con cuenta corriente y ya están todos ocupados. Cobrá alguna deuda o pasá a un plan mayor.', v_max
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Tope de productos.
--
-- Solo en el INSERT: lo ya cargado se sigue vendiendo, editando y publicando
-- aunque el comercio esté por encima del tope. Un límite que apaga el catálogo
-- que ya funciona no es un límite comercial, es una caída del servicio.
--
-- Vale igual para la importación de planilla y la aprobación de remitos: las
-- dos terminan en INSERT sobre `productos`, así que el freno es el mismo y no
-- hay un camino masivo que se saltee el tope. En la planilla cada fila es su
-- propio savepoint, así que las que entran antes del tope quedan y el resto
-- falla con este mensaje.
-- ---------------------------------------------------------------------------
create or replace function public.validar_limite_productos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_max      int;
    v_actuales int;
BEGIN
    v_max := nullif(public.reglas_negocio(NEW.negocio_id) ->> 'max_productos', 'null')::int;

    IF v_max IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_actuales
    FROM public.productos WHERE negocio_id = NEW.negocio_id;

    IF v_actuales >= v_max THEN
      RAISE EXCEPTION
        'El plan permite % productos y ya están cargados. Podés seguir vendiendo y editando los que tenés; para cargar más, pasá a un plan mayor.', v_max
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

drop trigger if exists trg_limite_productos on public.productos;
create trigger trg_limite_productos
  before insert on public.productos
  for each row execute function public.validar_limite_productos();
