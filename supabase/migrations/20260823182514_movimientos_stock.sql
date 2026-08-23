-- ---------------------------------------------------------------------------
-- `movimientos_stock`: el nivel de stock a lo largo del tiempo.
--
-- POR QUÉ, y por qué ahora. `producto_variantes.stock` es un escalar que se
-- pisa: la base sabe cuánto hay AHORA y nada más. No se puede reconstruir
-- "esta variante estuvo en cero del 3 al 11 de agosto", que es el hecho detrás
-- de un quiebre — y un quiebre no deja registro por definición: la venta que
-- no se hizo no existe en ninguna tabla.
--
-- Cada día que pasa sin esto es historia que no vuelve. Por eso entra antes
-- que cualquier señal de Insights que la use: la tabla tiene que estar
-- acumulando desde ya, aunque las pantallas que la lean se construyan después.
--
-- Ya existe una RECONSTRUCCIÓN en `get-movimientos-stock.ts`, que arma la
-- historia mezclando cinco tablas en JS (remitos, devoluciones, ventas, bajas
-- y la auditoría de variantes). Está bien hecha y no se toca en esta
-- migración, pero tiene tres límites que ninguna cantidad de SQL arregla:
--
--   1. Da DELTAS, nunca NIVELES. Sabe que salieron 2 unidades, no que
--      quedaron 0. La pregunta del quiebre es sobre el nivel.
--   2. Los reversos no aparecen. Cuando `create-sale` falla después de
--      descontar y llama a `revertirStockDescontado`, la mercadería se mueve
--      dos veces y no queda rastro de ninguna de las dos.
--   3. Empareja por `variante` en texto, con el mismo problema que ya costó
--      caro en `ventas_items`: un talle renombrado deja de matchear.
--
-- CÓMO: un TRIGGER sobre `producto_variantes`, no una llamada dentro de cada
-- RPC. La diferencia importa. Un camino que se olvida de registrar es un
-- agujero que recién se descubre meses después, cuando los números ya están
-- mal y no hay forma de saber desde cuándo. Con trigger no hay camino que
-- pueda saltearlo: ni `aprobar_orden_compra` con su UPDATE en batch, ni un
-- ajuste hecho a mano desde el panel, ni el código que todavía no existe.
-- Además `stock_anterior` / `stock_nuevo` salen del propio UPDATE, o sea que
-- son exactos aun con dos cajas vendiendo la misma variante al mismo tiempo:
-- leerlos con un SELECT aparte sería el patrón que ya costó plata dos veces
-- en este proyecto.
--
-- El PORQUÉ del movimiento no lo puede adivinar el trigger, así que viaja por
-- una variable de transacción (`comerz.origen_movimiento`) que cada camino
-- setea. Cuando nadie la setea el origen queda en DESCONOCIDO, que es la
-- verdad; no en 'AJUSTE', que sería una suposición disfrazada de dato.
--
-- Append-only por RLS: hay policy de INSERT y de SELECT, y NO hay de UPDATE ni
-- de DELETE, así que la base las deniega. Mismo criterio que `comprobantes` y
-- que el turno de caja cerrado. Sin FK a `producto_variantes`, igual que
-- `producto_variantes_auditoria`: el historial tiene que sobrevivir a que la
-- variante desaparezca, que es justamente uno de los movimientos que registra.
-- ---------------------------------------------------------------------------

create table if not exists public.movimientos_stock (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     uuid not null default security.current_negocio_id(),
  variante_id    uuid not null,
  producto_id    uuid,
  -- delta y stock_anterior van NULL solo en la foto inicial: no hubo
  -- movimiento, es el punto de partida desde el que se cuenta.
  delta          numeric(12,3),
  stock_anterior numeric(12,3),
  stock_nuevo    numeric(12,3) not null,
  origen         text not null default 'DESCONOCIDO',
  -- La venta, el remito o la baja que lo causó. Sin FK por el mismo motivo
  -- que la falta de FK a la variante.
  referencia_id  uuid,
  usuario_id     uuid,
  creado_en      timestamptz not null default now(),

  constraint movimientos_stock_origen_check check (origen in (
    'VENTA',              -- descuento al cerrar la venta
    'ANULACION_VENTA',    -- devolución de stock al anular
    'REVERSO_VENTA',      -- la venta falló después de descontar
    'REMITO',             -- aprobación de orden de compra
    'CARGA_RAPIDA',       -- alta/reposición desde Carga Rápida
    'IMPORTACION',        -- importación de planilla
    'EDICION_VARIANTES',  -- guardado del producto desde el panel
    'BAJA',               -- baja de inventario
    'FOTO_INICIAL',       -- punto de partida, sin movimiento
    'DESCONOCIDO'         -- nadie declaró el origen. Es un dato, no un default cómodo.
  )),
  -- La foto inicial es el único caso sin delta, y todo movimiento real tiene
  -- que traerlo. Evita que una fila quede a mitad de camino entre las dos.
  constraint movimientos_stock_foto_check check (
    (origen = 'FOTO_INICIAL') = (delta is null)
    and (delta is null) = (stock_anterior is null)
  )
);

comment on table public.movimientos_stock is
  'Historia del NIVEL de stock por variante. Append-only (no hay policy de UPDATE ni DELETE). La escribe un trigger sobre producto_variantes, así que ningún camino puede saltearla. stock_nuevo es lo que hace computable un quiebre: sin nivel, un delta no dice si quedó en cero.';
comment on column public.movimientos_stock.stock_nuevo is
  'Stock DESPUÉS del movimiento, tomado del propio UPDATE. Es el dato que permite reconstruir desde cuándo una variante está en cero.';
comment on column public.movimientos_stock.origen is
  'Por qué se movió. Viaja por la variable de transacción comerz.origen_movimiento; DESCONOCIDO significa que nadie la declaró, no que haya sido un ajuste.';

-- Los dos accesos reales: "qué le pasó a esta variante" (línea de tiempo de
-- una) y "qué pasó en el negocio" (el feed). Los dos arrancan por negocio_id
-- porque la RLS ya está resuelta por statement y ese es el primer filtro de
-- toda consulta.
create index if not exists idx_movimientos_stock_variante
  on public.movimientos_stock (negocio_id, variante_id, creado_en desc);
create index if not exists idx_movimientos_stock_feed
  on public.movimientos_stock (negocio_id, creado_en desc);
create index if not exists idx_movimientos_stock_referencia
  on public.movimientos_stock (negocio_id, referencia_id)
  where referencia_id is not null;

alter table public.movimientos_stock enable row level security;

-- RESTRICTIVE de aislamiento, escrita con la forma que usa el índice:
-- `negocio_id = (select ...)`, NUNCA `same_negocio(negocio_id)` — la segunda
-- recibe la columna como argumento y Postgres la ejecuta una vez por fila.
create policy aislamiento_negocio on public.movimientos_stock
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

-- Leer la historia de stock no es más sensible que leer las ventas y las
-- bajas de las que hoy se reconstruye, y esas ya las lee cualquier usuario
-- del negocio. No se achica una superficie que ya existe.
create policy movimientos_stock_select on public.movimientos_stock
  for select to authenticated using (true);

-- El insert lo hace el trigger, que corre como definer; esta policy es para
-- que el camino normal tampoco necesite privilegios especiales.
create policy movimientos_stock_insert on public.movimientos_stock
  for insert to authenticated with check (true);

-- Sin policy de UPDATE ni de DELETE: append-only por deny-by-default.

-- ---------------------------------------------------------------------------
-- El trigger.
--
-- SECURITY DEFINER a propósito, y es la única excepción a la regla de que todo
-- corre con la RLS del que llama: la auditoría no puede depender de que el
-- que mueve el stock tenga permiso de escribirla. Si pudiera, alcanzaría con
-- no tenerlo para mover mercadería sin dejar rastro.
--
-- Devuelve NULL porque es AFTER: el valor de retorno se ignora.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_movimiento_stock()
returns trigger
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_anterior numeric;
  v_nuevo    numeric;
  v_variante uuid;
  v_producto uuid;
  v_negocio  uuid;
  v_origen   text;
begin
  -- Escotilla para los caminos que registran su propio movimiento NETO.
  -- Hoy la usa el guardado de variantes, que borra y reinserta todas las
  -- variantes del producto en cada guardado: sin esto, corregir un precio
  -- generaría un egreso y un ingreso por variante, con un cero intermedio
  -- que nunca existió en el mostrador y que arruinaría justo la cuenta de
  -- quiebres que motiva esta tabla.
  if coalesce(current_setting('comerz.omitir_movimiento', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_anterior := 0;
    v_nuevo    := coalesce(new.stock, 0);
    v_variante := new.id;
    v_producto := new.producto_id;
    v_negocio  := new.negocio_id;
  elsif tg_op = 'UPDATE' then
    if new.stock is not distinct from old.stock then
      return null;
    end if;
    v_anterior := coalesce(old.stock, 0);
    v_nuevo    := coalesce(new.stock, 0);
    v_variante := new.id;
    v_producto := new.producto_id;
    v_negocio  := new.negocio_id;
  else
    v_anterior := coalesce(old.stock, 0);
    v_nuevo    := 0;
    v_variante := old.id;
    v_producto := old.producto_id;
    v_negocio  := old.negocio_id;
  end if;

  if v_nuevo = v_anterior then
    return null;
  end if;

  -- Un origen que no se reconoce se guarda como DESCONOCIDO en vez de hacer
  -- fallar el CHECK. El CHECK tiene que frenar datos mal escritos, no frenar
  -- una venta porque alguien escribió mal una etiqueta.
  v_origen := coalesce(nullif(current_setting('comerz.origen_movimiento', true), ''), 'DESCONOCIDO');
  if v_origen not in (
    'VENTA', 'ANULACION_VENTA', 'REVERSO_VENTA', 'REMITO', 'CARGA_RAPIDA',
    'IMPORTACION', 'EDICION_VARIANTES', 'BAJA', 'DESCONOCIDO'
  ) then
    v_origen := 'DESCONOCIDO';
  end if;

  insert into public.movimientos_stock (
    negocio_id, variante_id, producto_id,
    delta, stock_anterior, stock_nuevo,
    origen, referencia_id, usuario_id
  ) values (
    v_negocio, v_variante, v_producto,
    v_nuevo - v_anterior, v_anterior, v_nuevo,
    v_origen,
    nullif(current_setting('comerz.referencia_movimiento', true), '')::uuid,
    auth.uid()
  );

  return null;
end;
$$;

drop trigger if exists trg_movimiento_stock on public.producto_variantes;
create trigger trg_movimiento_stock
  after insert or update or delete on public.producto_variantes
  for each row execute function public.registrar_movimiento_stock();

-- ---------------------------------------------------------------------------
-- Declarar el origen. Transaction-local (`is_local => true`): vale para la
-- transacción en curso y nada más, así que no se filtra al siguiente request
-- que reuse la conexión del pool. Esto último no es un detalle: con
-- `is_local => false` una venta le pondría origen VENTA al remito que se
-- apruebe después en la misma conexión.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_origen_movimiento(
  p_origen      text,
  p_referencia  uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform set_config('comerz.origen_movimiento', coalesce(p_origen, ''), true);
  perform set_config('comerz.referencia_movimiento', coalesce(p_referencia::text, ''), true);
end;
$$;

revoke all on function public.marcar_origen_movimiento(text, uuid) from public;
grant execute on function public.marcar_origen_movimiento(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- `ajustar_stock_variante` acepta el origen.
--
-- Es el camino que usan la venta, la anulación y Carga Rápida, y cada uno es
-- una llamada suelta desde Node: como `set_config` es transaction-local y
-- cada RPC es su propia transacción, el origen NO puede setearse antes desde
-- el cliente. Tiene que viajar con la llamada.
--
-- Se hace DROP + CREATE en vez de agregar parámetros con default sobre la
-- función vieja: dejarlas a las dos haría ambigua toda llamada de 3
-- argumentos. Los callers actuales pasan los parámetros por nombre, así que
-- siguen funcionando sin tocar nada — la migración es segura de aplicar ANTES
-- del deploy del código.
--
-- El movimiento y el cambio de stock son el MISMO statement (el trigger corre
-- dentro del UPDATE): no existe el estado intermedio donde el stock se movió
-- y el registro no.
-- ---------------------------------------------------------------------------
drop function if exists public.ajustar_stock_variante(uuid, numeric, boolean);

create function public.ajustar_stock_variante(
  p_variante_id       uuid,
  p_delta             numeric,
  p_permitir_negativo boolean default false,
  p_origen            text    default null,
  p_referencia_id     uuid    default null
)
returns table (id uuid, stock numeric)
language plpgsql
security invoker
set search_path = ''
as $$
-- Los nombres de salida `id` y `stock` son OUT params, y en plpgsql SOMBREAN
-- a las columnas homónimas: sin esta directiva, `set stock = stock + p_delta`
-- es "column reference stock is ambiguous" y la venta se cae entera. La
-- versión anterior era `language sql`, donde el problema no existe. Los
-- nombres se mantienen porque son el contrato que lee el cliente.
#variable_conflict use_column
begin
  if p_origen is not null then
    perform public.marcar_origen_movimiento(p_origen, p_referencia_id);
  end if;

  return query
  update public.producto_variantes
     set stock = producto_variantes.stock + p_delta
   where producto_variantes.id = p_variante_id
     and (p_permitir_negativo or producto_variantes.stock + p_delta >= 0)
  returning producto_variantes.id, producto_variantes.stock;
end;
$$;

revoke all on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) from public;
grant execute on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Wrappers para las dos RPC que mueven stock adentro suyo.
--
-- Se renombra la original a `_impl` y el nombre público pasa a ser una función
-- que declara el origen y delega. Es preferible a reescribir 6.000 caracteres
-- de lógica de negocio probada solo para agregarle una línea arriba: cuanto
-- menos se toque `aprobar_orden_compra`, mejor.
--
-- SECURITY INVOKER las dos, igual que las originales: el aislamiento entre
-- negocios tiene que seguir siendo la RLS del que llama.
-- ---------------------------------------------------------------------------
alter function public.aprobar_orden_compra(uuid, text, jsonb)
  rename to aprobar_orden_compra_impl;

create or replace function public.aprobar_orden_compra(
  p_orden_id  uuid,
  p_proveedor text,
  p_items     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.marcar_origen_movimiento('REMITO', p_orden_id);
  return public.aprobar_orden_compra_impl(p_orden_id, p_proveedor, p_items);
end;
$$;

revoke all on function public.aprobar_orden_compra(uuid, text, jsonb) from public;
revoke all on function public.aprobar_orden_compra_impl(uuid, text, jsonb) from public;
grant execute on function public.aprobar_orden_compra(uuid, text, jsonb) to authenticated;
grant execute on function public.aprobar_orden_compra_impl(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- El guardado de variantes registra su movimiento NETO, no el del borrado y
-- reinserción.
--
-- `guardar_variantes_producto` borra TODAS las variantes del producto y las
-- vuelve a insertar en cada guardado. Con el trigger suelto, corregir el
-- precio de un producto con 9 talles escribiría 18 movimientos y 9 ceros
-- intermedios que nunca pasaron en el local — y esos ceros falsos son
-- exactamente lo que arruinaría la cuenta de quiebres.
--
-- Entonces: se apaga el trigger, y el wrapper compara el estado de antes
-- contra el de después usando `atributos_comparables`, que es la misma clave
-- con la que la RPC decide qué variante es cuál. Lo que se registra es lo que
-- efectivamente le pasó a la mercadería.
-- ---------------------------------------------------------------------------
alter function public.guardar_variantes_producto(uuid, uuid, jsonb, uuid, jsonb)
  rename to guardar_variantes_producto_impl;

create or replace function public.guardar_variantes_producto(
  p_producto_id          uuid,
  p_negocio_id           uuid,
  p_variantes            jsonb,
  p_editado_por          uuid,
  p_confirmadas_eliminar jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_antes    jsonb;
  v_despues  jsonb;
  v_resultado jsonb;
begin
  select coalesce(jsonb_object_agg(
           public.atributos_comparables(pv.atributos),
           jsonb_build_object('id', pv.id, 'stock', coalesce(pv.stock, 0))
         ), '{}'::jsonb)
    into v_antes
    from public.producto_variantes pv
   where pv.producto_id = p_producto_id
     and pv.negocio_id  = p_negocio_id;

  perform set_config('comerz.omitir_movimiento', 'on', true);

  v_resultado := public.guardar_variantes_producto_impl(
    p_producto_id, p_negocio_id, p_variantes, p_editado_por, p_confirmadas_eliminar
  );

  perform set_config('comerz.omitir_movimiento', '', true);

  -- El guardado bloqueado no escribió nada: no hay movimiento que registrar.
  if coalesce((v_resultado->>'blocked')::boolean, false) then
    return v_resultado;
  end if;

  select coalesce(jsonb_object_agg(
           public.atributos_comparables(pv.atributos),
           jsonb_build_object('id', pv.id, 'stock', coalesce(pv.stock, 0))
         ), '{}'::jsonb)
    into v_despues
    from public.producto_variantes pv
   where pv.producto_id = p_producto_id
     and pv.negocio_id  = p_negocio_id;

  insert into public.movimientos_stock (
    negocio_id, variante_id, producto_id,
    delta, stock_anterior, stock_nuevo,
    origen, referencia_id, usuario_id
  )
  select
    p_negocio_id,
    -- La variante de DESPUÉS cuando sigue existiendo; la de antes cuando se
    -- eliminó, que es el único id que queda para colgarle el movimiento.
    coalesce((v_despues->clave->>'id')::uuid, (v_antes->clave->>'id')::uuid),
    p_producto_id,
    despues - antes,
    antes,
    despues,
    'EDICION_VARIANTES',
    p_producto_id,
    p_editado_por
  from (
    select
      clave,
      coalesce((v_antes  ->clave->>'stock')::numeric, 0) as antes,
      coalesce((v_despues->clave->>'stock')::numeric, 0) as despues
    from (
      select jsonb_object_keys(v_antes) as clave
      union
      select jsonb_object_keys(v_despues)
    ) claves
  ) cambios
  where despues <> antes;

  return v_resultado;
end;
$$;

revoke all on function public.guardar_variantes_producto(uuid, uuid, jsonb, uuid, jsonb) from public;
revoke all on function public.guardar_variantes_producto_impl(uuid, uuid, jsonb, uuid, jsonb) from public;
grant execute on function public.guardar_variantes_producto(uuid, uuid, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.guardar_variantes_producto_impl(uuid, uuid, jsonb, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Foto inicial: el punto desde el que se empieza a contar.
--
-- No se puede backfillear la historia —el nivel pasado no está guardado en
-- ningún lado y reconstruirlo desde los deltas daría un número inventado— pero
-- sí se puede fechar el arranque. Sin esta foto, una variante que hoy está en
-- cero y no se mueve nunca más no tendría una sola fila, y no habría forma de
-- decir "está en cero desde al menos el 23/8".
--
-- delta y stock_anterior van NULL a propósito: no hubo movimiento.
-- ---------------------------------------------------------------------------
insert into public.movimientos_stock (
  negocio_id, variante_id, producto_id, delta, stock_anterior, stock_nuevo, origen
)
select pv.negocio_id, pv.id, pv.producto_id, null, null, coalesce(pv.stock, 0), 'FOTO_INICIAL'
  from public.producto_variantes pv
 where not exists (
   select 1 from public.movimientos_stock m where m.variante_id = pv.id
 );
