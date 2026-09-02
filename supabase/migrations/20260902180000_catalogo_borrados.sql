-- `catalogo_borrados`: qué se borró del catálogo y cuándo.
--
-- EL AGUJERO QUE CIERRA. `productos` y `producto_variantes` se borran con
-- DELETE físico (`eliminarProductoAction`, `bulkDeleteProductsAction`, y la
-- baja de una variante desde el guardado). Cuando una fila se va, no queda
-- rastro de que existió: ni columna `borrado_en`, ni fila en ninguna tabla.
--
-- Para cualquier cosa que tenga una copia del catálogo, eso es peor que un
-- dato viejo. `updated_at` —que desde 20260902160000 y 20260902170000 sí
-- funciona— responde "qué cambió", pero una fila borrada no cambia: desaparece.
-- Preguntando por `updated_at` no se entera nadie. El síntoma sería un
-- producto que ya no existe quedándose para siempre en el celular, y una venta
-- que falla recién al cerrarse, con la clienta adelante.
--
-- Medido: 306 de 3.468 `variante_id` vistos en `movimientos_stock` ya no
-- existen, y 4 productos borrados de verdad.
--
-- POR QUÉ NO ALCANZABA CON LO QUE YA HABÍA, que era la primera opción a mirar:
--
--   * `producto_variantes_auditoria` registra 'ELIMINADA' (292 filas), pero
--     SOLO la escribe `guardar_variantes_producto`. Un producto borrado
--     cascadea sus variantes sin dejar una sola fila ahí. Y no cubre
--     `productos` en absoluto.
--   * `movimientos_stock` tiene el trigger corriendo también en DELETE, pero
--     arranca con `if v_nuevo = v_anterior then return null`: borrar una
--     variante que ya estaba en CERO no escribe nada. Hoy el 24,6% de las
--     variantes de Evens (829 de 3.364) están en cero, o sea que el agujero
--     cubre justo a las que más probablemente se den de baja.
--
-- POR QUÉ TRIGGER, otra vez. Misma razón que 20260902170000 y que
-- 20260823182514: un camino que se olvida de registrar es un agujero que se
-- descubre meses después. Acá es más fuerte todavía, porque el DELETE puede
-- venir por CASCADE desde `productos` — no hay código de aplicación en el
-- medio que uno pueda acordarse de tocar.
--
-- UNA SOLA TABLA para las tres, y no una columna `borrado_en` en cada una
-- (soft delete). El soft delete habría obligado a filtrar `where borrado_en is
-- null` en TODAS las consultas del catálogo —el POS, la tienda, los reportes,
-- las RPC— y cada lugar que se olvide muestra mercadería fantasma. Es cambiar
-- un agujero silencioso por otro, más grande. Una tabla aparte no toca ninguna
-- consulta existente.
--
-- QUÉ GUARDA Y QUÉ NO. Lo mínimo para que el que tiene una copia sepa qué
-- sacar: tabla, id, negocio y cuándo. NO guarda la fila borrada: para eso ya
-- están `producto_variantes_auditoria` (que conserva atributos, stock y
-- precios) y `variantes_fusionadas`. Esto es un aviso de baja, no un backup.
--
-- CRECIMIENTO Y PURGA. La tabla crece sin techo, como todo log. Con el ritmo
-- actual son ~80 filas por semana en los seis negocios, así que no es urgente,
-- pero cuando se purgue hay que saber la regla: un cliente que estuvo
-- desconectado MÁS TIEMPO que la ventana de retención no puede sincronizar por
-- delta, tiene que recargar todo. Por eso la purga y el vencimiento del cache
-- local (hoy 7 días en `shared/lib/cache-offline.ts`) tienen que decidirse
-- juntos, y la retención tiene que ser holgadamente mayor.
--
-- REVERSIBLE: se dropean triggers y tabla. Ver el `_down`.

begin;

create table if not exists public.catalogo_borrados (
  id          bigint generated always as identity primary key,
  negocio_id  uuid not null,
  tabla       text not null check (tabla in ('productos', 'producto_variantes', 'categorias')),
  fila_id     uuid not null,
  borrado_en  timestamptz not null default now(),
  borrado_por uuid
);

comment on table public.catalogo_borrados is
  'Avisos de baja del catálogo: qué fila se borró, de qué tabla y cuándo. Lo escribe un trigger AFTER DELETE, así que ningún camino lo puede saltear (ni el CASCADE). Existe porque una fila borrada no se puede detectar mirando updated_at. Ver 20260902180000.';

comment on column public.catalogo_borrados.borrado_por is
  'auth.uid() del que borró, o null si vino por CASCADE o desde una migración. No es null-able por error: un borrado en cascada no tiene autor propio.';

-- La clave de lectura de una sync: "dame las bajas de este negocio desde tal
-- fecha". `id` va en el índice para desempatar dos bajas en el mismo instante
-- y poder paginar sin saltearse ninguna.
create index if not exists idx_catalogo_borrados_feed
  on public.catalogo_borrados (negocio_id, borrado_en, id);

alter table public.catalogo_borrados enable row level security;

-- RESTRICTIVE de aislamiento, con la forma que usa el índice:
-- `negocio_id = (select ...)`, NUNCA `same_negocio(negocio_id)`.
create policy aislamiento_negocio on public.catalogo_borrados
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

-- Saber que un producto se borró no es más sensible que haberlo visto vivo.
create policy catalogo_borrados_select on public.catalogo_borrados
  for select to authenticated using (true);

create policy catalogo_borrados_insert on public.catalogo_borrados
  for insert to authenticated with check (true);

-- Sin policy de UPDATE ni de DELETE: append-only por deny-by-default, mismo
-- criterio que `movimientos_stock` y `comprobantes`. Un aviso de baja que se
-- puede borrar no sirve para nada.

-- ---------------------------------------------------------------------------
-- El trigger.
--
-- SECURITY DEFINER por el mismo motivo que `registrar_movimiento_stock`: el
-- registro de la baja no puede depender de que el que borra tenga permiso de
-- escribirlo. Si dependiera, alcanzaría con no tenerlo para borrar sin dejar
-- rastro.
--
-- AFTER DELETE y no BEFORE: si el borrado se revierte por un error posterior
-- en la misma transacción, el aviso se va con él. Un tombstone de algo que
-- sigue existiendo haría que el cliente borre de su copia un producto vivo.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_borrado_catalogo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.catalogo_borrados (negocio_id, tabla, fila_id, borrado_por)
  values (old.negocio_id, tg_table_name, old.id, auth.uid());

  return null;
end;
$$;

comment on function public.registrar_borrado_catalogo() is
  'AFTER DELETE sobre las tablas del catálogo: deja el aviso de baja en catalogo_borrados. SECURITY DEFINER para que el registro no dependa de los permisos del que borra.';

create trigger trg_productos_borrado
  after delete on public.productos
  for each row execute function public.registrar_borrado_catalogo();

create trigger trg_producto_variantes_borrado
  after delete on public.producto_variantes
  for each row execute function public.registrar_borrado_catalogo();

create trigger trg_categorias_borrado
  after delete on public.categorias
  for each row execute function public.registrar_borrado_catalogo();

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
    from (values ('productos'), ('producto_variantes'), ('categorias')) as t(tabla)
   where not exists (
     select 1 from pg_trigger g
      where g.tgrelid = ('public.' || t.tabla)::regclass
        and g.tgname = 'trg_' || t.tabla || '_borrado'
   );

  if v_faltan > 0 then
    raise exception 'Faltan % triggers de baja de catálogo.', v_faltan;
  end if;
end $$;

commit;
