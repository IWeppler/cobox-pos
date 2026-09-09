-- ---------------------------------------------------------------------------
-- Borrar un producto tiene que dejar rastro de la mercadería que se lleva.
--
-- LO QUE PASA HOY. `productos` cascadea a `producto_variantes`, y el trigger
-- `trg_movimiento_stock` sí registra el DELETE (es AFTER INSERT OR DELETE OR
-- UPDATE), así que la baja del stock queda escrita. Pero el PORQUÉ viaja en
-- `comerz.origen_movimiento`, que es transaction-local, y el borrado sale de
-- un `.delete()` suelto desde Node: nadie declara el origen, así que la fila
-- queda en DESCONOCIDO — que es la verdad, pero es la verdad menos útil.
--
-- POR QUÉ IMPORTA, con un caso medido. `ordenes_items.producto_id` es
-- ON DELETE SET NULL, así que borrar un producto blanquea todas las líneas de
-- remito que lo alimentaron. El 8/9/2026, en Evens, se borró "CAMISA CADARUVE
-- CRAYADAS" un rato después de aprobar el remito "CAMISAS VESTIDOS 2": las 8
-- líneas quedaron con `producto_id` null y `variante_match` lleno, o sea
-- impactadas y huérfanas. Auditando eso no se podía distinguir —sin abrir
-- movimientos_stock a mano— entre "esta mercadería nunca entró" y "entró y
-- después alguien borró el producto". Son 109 líneas en toda la base y las dos
-- lecturas llevan a acciones opuestas.
--
-- QUÉ CAMBIA. Un origen propio, `BAJA_PRODUCTO`, y una función que lo declara
-- y borra EN LA MISMA TRANSACCIÓN. Eso último no es un detalle de estilo:
-- `set_config(..., true)` no cruza transacciones, así que llamar a
-- `marcar_origen_movimiento` desde Node y borrar en el request siguiente no
-- pinta nada — es la misma razón por la que `ajustar_stock_variante` recibe
-- `p_origen` en vez de que se lo seteen antes.
--
-- NO se reusa el origen 'BAJA', que ya existe en la lista blanca: ese es el de
-- la tabla `bajas` (merma, rotura, mercadería que se descarta). Borrar la
-- ficha del catálogo es otra cosa, y meter las dos en el mismo cajón deja la
-- pregunta "¿cuánta mercadería se perdió?" sin respuesta posible.
--
-- SECURITY INVOKER a propósito: quién puede borrar lo sigue decidiendo la RLS
-- de `productos` (`stock.eliminar_producto` desde 20260905120000). Una función
-- DEFINER acá sería una puerta de atrás a ese permiso.
--
-- Y devuelve la cantidad borrada porque un DELETE filtrado por RLS devuelve 0
-- filas con `error: null` — el mismo éxito silencioso que ya costó 35 fotos el
-- 5/9/2026. Con el contador, la action puede distinguir "borrado" de "no
-- tenías permiso".
--
-- El cuerpo del trigger se copia del cuerpo VIVO (`pg_get_functiondef`), no de
-- un archivo: lección de 20260904140000.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_movimiento_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'security', 'pg_temp'
as $function$
declare
  v_anterior numeric;
  v_nuevo    numeric;
  v_variante uuid;
  v_producto uuid;
  v_negocio  uuid;
  v_origen   text;
begin
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

  v_origen := coalesce(nullif(current_setting('comerz.origen_movimiento', true), ''), 'DESCONOCIDO');
  if v_origen not in (
    'VENTA', 'ANULACION_VENTA', 'REVERSO_VENTA', 'REMITO', 'CARGA_RAPIDA',
    'IMPORTACION', 'EDICION_VARIANTES', 'BAJA', 'BAJA_PRODUCTO', 'DESCONOCIDO'
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
$function$;

-- El único camino de borrado de productos de la app. Individual y en lote son
-- la misma función: el lote es un array de uno.
create or replace function public.eliminar_productos(p_producto_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_borrados integer;
begin
  if p_producto_ids is null or array_length(p_producto_ids, 1) is null then
    return 0;
  end if;

  perform public.marcar_origen_movimiento('BAJA_PRODUCTO', null);

  delete from public.productos
  where id = any (p_producto_ids);

  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$function$;

comment on function public.eliminar_productos(uuid[]) is
  'Borra productos declarando el origen BAJA_PRODUCTO en la misma transaccion, '
  'para que la baja de stock que cascadea quede fechada y explicada en '
  'movimientos_stock. SECURITY INVOKER: el permiso lo sigue decidiendo la RLS.';

grant execute on function public.eliminar_productos(uuid[]) to authenticated;

-- Guard: la lista blanca del trigger tiene que aceptar el origen nuevo, y la
-- función de borrado tiene que declararlo. Sin las dos piezas el rastro vuelve
-- a ser DESCONOCIDO sin que nadie se entere.
do $do$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'registrar_movimiento_stock';

  if v_def is null or position('BAJA_PRODUCTO' in v_def) = 0 then
    raise exception 'registrar_movimiento_stock quedo sin el origen BAJA_PRODUCTO';
  end if;

  if position('comerz.omitir_movimiento' in v_def) = 0 then
    raise exception 'registrar_movimiento_stock quedo sin el escape de omitir_movimiento';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'eliminar_productos';

  if v_def is null or position('BAJA_PRODUCTO' in v_def) = 0 then
    raise exception 'eliminar_productos no declara el origen BAJA_PRODUCTO';
  end if;

  if position('security definer' in lower(v_def)) > 0 then
    raise exception 'eliminar_productos no puede ser SECURITY DEFINER: saltearia stock.eliminar_producto';
  end if;
end;
$do$;
