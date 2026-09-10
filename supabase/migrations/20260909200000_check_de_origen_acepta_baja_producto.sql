-- ---------------------------------------------------------------------------
-- El CHECK de `movimientos_stock.origen` tiene que aceptar BAJA_PRODUCTO.
--
-- QUÉ ROMPIÓ. `20260909150000` agregó el origen `BAJA_PRODUCTO` a la lista
-- blanca de `registrar_movimiento_stock` y a `eliminar_productos`, pero NO al
-- CHECK de la tabla. Son dos listas que tienen que decir lo mismo y quedaron
-- distintas, así que desde que se deployó ese cambio **borrar cualquier
-- producto con stock distinto de cero falla**:
--
--   23514: new row for relation "movimientos_stock" violates check constraint
--   "movimientos_stock_origen_check"
--
-- Reportado en Estilo Bonito sobre "remera bebe" (3 unidades), 9/9/2026.
--
-- POR QUÉ NO LO ATAJÓ EL GUARD de aquella migración: chequeaba que el cuerpo
-- del trigger contuviera 'BAJA_PRODUCTO', y lo contenía. Verificar que UNA de
-- las dos listas tiene el valor no dice nada sobre la otra.
--
-- POR QUÉ NO LO ATAJÓ LA PRUEBA: se ensayó con un `delete from productos`
-- suelto en vez de llamar a `eliminar_productos`. Sin la RPC nadie declara el
-- origen, el movimiento sale DESCONOCIDO y pasa el CHECK. La prueba recorrió
-- todo el camino menos la línea que fallaba.
-- **Un ensayo de un camino nuevo tiene que entrar por la puerta nueva.**
--
-- DE PASO, la otra mitad del desalineamiento: el CHECK acepta
-- `DEVOLUCION_PARCIAL` y la lista blanca del trigger NO. O sea que un
-- movimiento de devolución parcial se degrada a DESCONOCIDO en silencio —
-- exactamente el mismo tipo de bug, en la dirección contraria y ya presente
-- antes de hoy. Se agrega al trigger para que las dos listas coincidan de
-- verdad.
--
-- El guard de abajo compara las DOS listas entre sí, que es lo que había que
-- hacer desde el principio.
-- ---------------------------------------------------------------------------

alter table public.movimientos_stock
  drop constraint if exists movimientos_stock_origen_check;

alter table public.movimientos_stock
  add constraint movimientos_stock_origen_check check (
    origen = any (array[
      'VENTA', 'ANULACION_VENTA', 'DEVOLUCION_PARCIAL', 'REVERSO_VENTA',
      'REMITO', 'CARGA_RAPIDA', 'IMPORTACION', 'EDICION_VARIANTES',
      'BAJA', 'BAJA_PRODUCTO', 'FOTO_INICIAL', 'DESCONOCIDO'
    ])
  );

-- El trigger, con la lista completa. Cuerpo copiado del VIVO
-- (`pg_get_functiondef`), no de un archivo: leccion de `20260904140000`.
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
    'VENTA', 'ANULACION_VENTA', 'DEVOLUCION_PARCIAL', 'REVERSO_VENTA',
    'REMITO', 'CARGA_RAPIDA', 'IMPORTACION', 'EDICION_VARIANTES',
    'BAJA', 'BAJA_PRODUCTO', 'DESCONOCIDO'
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

-- Guard: las dos listas tienen que coincidir. `FOTO_INICIAL` es la unica
-- excepcion legitima — la escribio el backfill del 23/8 y el trigger no la
-- puede emitir, porque no hay movimiento que la produzca.
do $do$
declare
  v_def text;
  v_check text;
  v_origen text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'registrar_movimiento_stock';

  select pg_get_constraintdef(con.oid) into v_check
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  where c.relname = 'movimientos_stock'
    and con.conname = 'movimientos_stock_origen_check';

  if v_def is null or v_check is null then
    raise exception 'falta el trigger o el CHECK de movimientos_stock';
  end if;

  foreach v_origen in array array[
    'VENTA', 'ANULACION_VENTA', 'DEVOLUCION_PARCIAL', 'REVERSO_VENTA',
    'REMITO', 'CARGA_RAPIDA', 'IMPORTACION', 'EDICION_VARIANTES',
    'BAJA', 'BAJA_PRODUCTO', 'DESCONOCIDO'
  ]
  loop
    if position(v_origen in v_check) = 0 then
      raise exception 'el CHECK no acepta el origen %, que el trigger si emite', v_origen;
    end if;
    if position(v_origen in v_def) = 0 then
      raise exception 'el trigger no emite el origen %, que el CHECK si acepta', v_origen;
    end if;
  end loop;
end;
$do$;
