-- `productos.updated_at`, y un TRIGGER que la mantenga en las cinco tablas del
-- catálogo.
--
-- ============================================================================
-- PARTE 1: la columna que faltaba
-- ============================================================================
--
-- `productos` no tenía `updated_at`. Solo `creado_en`. O sea que cambiar el
-- precio, el nombre, la categoría, la foto, `destacado_en` o `publicado` no
-- dejaba marca en NINGÚN lado — ni en la fila, ni en un log, ni en una tabla
-- de auditoría. Un producto despublicado seguía viéndose "sin cambios" para
-- cualquiera que preguntara qué se modificó.
--
-- Para el catálogo local que se quiere sincronizar por delta eso es lo peor de
-- todo: un precio viejo en el mostrador no es un dato desactualizado, es plata
-- mal cobrada.
--
-- EL BACKFILL VA A `creado_en`, NO A `now()`. Poner now() diría que los 1.987
-- productos se modificaron hoy, que es falso, y además haría que la primera
-- sincronización incremental se trajera el catálogo entero. `creado_en` es la
-- verdad disponible: "no tenemos registro de ninguna modificación posterior al
-- alta". Se agrega nullable, se rellena y recién después se pone NOT NULL: así
-- no hay un instante en que la columna mienta con un default.
--
-- ============================================================================
-- PARTE 2: por qué TRIGGER y no escribirla en cada camino
-- ============================================================================
--
-- Esta es la lección de `producto_variantes.updated_at`, que existe desde el
-- esquema maestro y NUNCA tuvo trigger. Dependía de que cada camino de
-- escritura la seteara a mano, y el resultado medido fue: 3.355 de 3.364
-- variantes de Evens (99,7%) con `updated_at` exactamente igual a
-- `created_at`, mientras `movimientos_stock` registraba 475 movimientos reales
-- en 7 días. La columna existía, siempre devolvía una fecha con pinta de
-- válida, y era mentira.
--
-- Recién en 20260902110000 y 20260902160000 se fueron arreglando los caminos
-- de a uno: el guardado de variantes, la venta, el lote de ventas, el ajuste
-- de precios. Cuatro migraciones para una columna. Y el que se escriba mañana
-- se vuelve a olvidar.
--
-- Es exactamente el argumento que ya está escrito en 20260823182514 para
-- `movimientos_stock`: la escribe un TRIGGER y no una llamada adentro de cada
-- RPC, porque "un camino que se olvida de registrar es un agujero que se
-- descubre meses después con los números ya mal". Con trigger no hay camino
-- que lo saltee — ni el UPDATE en lote, ni un ajuste a mano por SQL, ni el
-- código que todavía no existe.
--
-- LAS CINCO TABLAS son la superficie del catálogo que una sync incremental
-- tendría que mirar. Tres de ellas (`categorias`, `atributos`,
-- `atributo_valores`) ya tenían la columna y estaban al 100% sin tocar: en
-- Evens, 53 de 53 categorías, 4 de 4 atributos y 430 de 430 valores con
-- `updated_at = created_at`. Tenían el mismo problema y nadie lo había mirado.
--
-- `producto_variante_valores` queda AFUERA a propósito: no tiene ninguna
-- columna de tiempo, es una tabla puente sin identidad propia (se borra y se
-- reinserta con su variante) y desde 20260902020000 ni siquiera viaja al
-- cliente. Agregarle marca de tiempo sería inventarle una vida que no tiene.
--
-- QUÉ CAMBIA EN LA PRÁCTICA. Un UPDATE que no cambia nada igual mueve
-- `updated_at`. Es a propósito: para una sincronización, un falso positivo
-- cuesta una fila de más en el próximo delta, y un falso negativo cuesta un
-- precio viejo en el mostrador. No son comparables.
--
-- Las escrituras manuales que ya se agregaron (en `ajustar_stock_variante`,
-- `ajustar_stock_variantes`, `guardar_variantes_producto_impl`,
-- `aprobar_orden_compra`, `update-prices.ts` y `edit-product.ts`) quedan
-- redundantes pero NO se sacan: el trigger las pisa con el mismo `now()`, no
-- molestan, y sacarlas sería otro cambio en caminos que mueven plata.
--
-- REVERSIBLE: los triggers se dropean y la columna también. Ver el `_down`.

begin;

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------
alter table public.productos add column if not exists updated_at timestamptz;

update public.productos set updated_at = creado_en where updated_at is null;

alter table public.productos alter column updated_at set default now();
alter table public.productos alter column updated_at set not null;

comment on column public.productos.updated_at is
  'Última modificación de la fila, mantenida por el trigger trg_productos_updated_at. Backfilleada a creado_en en 20260902170000: antes de esa fecha no hay registro de modificaciones.';

-- ---------------------------------------------------------------------------
-- 2. El trigger, uno solo para las cinco
-- ---------------------------------------------------------------------------
create or replace function public.marcar_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.marcar_updated_at() is
  'BEFORE UPDATE: mantiene updated_at sin depender de que cada camino de escritura se acuerde. Ver 20260902170000 para por qué es trigger y no una línea en cada RPC.';

create trigger trg_productos_updated_at
  before update on public.productos
  for each row execute function public.marcar_updated_at();

create trigger trg_producto_variantes_updated_at
  before update on public.producto_variantes
  for each row execute function public.marcar_updated_at();

create trigger trg_categorias_updated_at
  before update on public.categorias
  for each row execute function public.marcar_updated_at();

create trigger trg_atributos_updated_at
  before update on public.atributos
  for each row execute function public.marcar_updated_at();

create trigger trg_atributo_valores_updated_at
  before update on public.atributo_valores
  for each row execute function public.marcar_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
    from (values ('productos'), ('producto_variantes'), ('categorias'),
                 ('atributos'), ('atributo_valores')) as t(tabla)
   where not exists (
     select 1 from pg_trigger g
      where g.tgrelid = ('public.' || t.tabla)::regclass
        and g.tgname = 'trg_' || t.tabla || '_updated_at'
   );

  if v_faltan > 0 then
    raise exception 'Faltan % triggers de updated_at.', v_faltan;
  end if;

  if exists (select 1 from public.productos where updated_at is null) then
    raise exception 'Quedaron productos con updated_at en null.';
  end if;
end $$;

commit;
