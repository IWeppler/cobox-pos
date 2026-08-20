-- ---------------------------------------------------------------------------
-- Cantidad decimal: toda la cadena de stock y venta pasa de integer a
-- numeric(12,3).
--
-- POR QUÉ
-- Hoy no existe forma de representar 0,750 kg en ninguna parte del sistema. No
-- es un problema de UI ni de validación: la columna no lo admite. Es el
-- bloqueo duro que frena a carnicería, fiambrería, verdulería, dietética,
-- panadería y kiosco (golosinas en bolsita, fiambre al corte).
-- Ver ROADMAP-VENTA-POR-PESO.md, Fase 1.
--
-- POR QUÉ numeric(12,3) Y NO float
-- Mismo motivo por el que la plata no es float: 0,1 + 0,2 en binario no da
-- 0,3, y acá el resultado multiplica un precio. Tres decimales cubre el gramo
-- (0,001 kg), que es lo que imprime cualquier balanza comercial.
--
-- POR QUÉ LA COLUMNA CAMBIA PARA TODOS Y NO SOLO PARA LOS RUBROS DE PESO
-- Una columna aparte para "cantidad decimal" significa dos caminos en la
-- anulación, en el arqueo, en la exportación al contador y en el importador —
-- y el día que uno de los dos se olvida de actualizarse, el stock miente sin
-- error. Con numeric y valores enteros el comportamiento es idéntico: los
-- 1.765 productos existentes están todos en unidad_medida = 'UNIDAD' y el POS
-- les sigue mostrando el stepper entero. Quién acepta decimales lo decide el
-- PRODUCTO (unidad_medida), no esta columna.
--
-- ESTA MIGRACIÓN VA SOLA
-- Sin ninguna feature encima. Toca el camino de la venta de los 4 negocios en
-- producción a la vez, así que su criterio de terminado es que en Evens no
-- cambie NI UN NÚMERO: mismo ticket, mismo arqueo, misma exportación.
--
-- RELEVAMIENTO PREVIO (verificado contra producción, 19/8):
--   - No hay vistas ni materializadas en public: cero riesgo de dependencia.
--   - No hay triggers sobre ninguna de las 6 tablas.
--   - No hay CHECK constraints sobre las columnas de cantidad.
--   - No hay índices sobre las columnas de cantidad (el ALTER no reconstruye
--     ninguno).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La función se DROPea, no se reemplaza.
--
-- Es el gotcha que hace que este cambio falle de forma intermitente si se hace
-- mal: `CREATE OR REPLACE` con otro tipo de parámetro NO reemplaza nada, crea
-- una SOBRECARGA. Quedarían las dos funciones vivas y PostgREST resolvería
-- cuál llamar según cómo serialice el número el cliente — o sea que "a veces"
-- entraría por la de integer y truncaría el peso. El guard del final del
-- archivo verifica que quedó una sola.
--
-- Va ANTES del ALTER porque su `RETURNS TABLE(id uuid, stock integer)` depende
-- del tipo de la columna.
-- ---------------------------------------------------------------------------
drop function if exists public.ajustar_stock_variante(uuid, integer, boolean);

-- ---------------------------------------------------------------------------
-- 2. Las columnas.
--
-- `using stock::numeric(12,3)` es implícito y sin pérdida (integer es
-- subconjunto de numeric), pero va explícito para que se lea qué hace.
-- ---------------------------------------------------------------------------

-- Fuente canónica del stock.
alter table public.producto_variantes
  alter column stock type numeric(12,3) using stock::numeric(12,3),
  alter column stock_minimo type numeric(12,3) using stock_minimo::numeric(12,3);

-- Espejo legacy. Se mueve por delta con `ajustar_stock_legacy`, que ya recibía
-- numeric: hasta hoy el delta decimal se truncaba recién al escribir la
-- columna.
alter table public.productos_stock
  alter column cantidad type numeric(12,3) using cantidad::numeric(12,3);

-- Renglón de venta. `registrar_venta` ya declara `cantidad numeric` en su
-- jsonb_to_recordset, así que el JSON nunca fue el problema: truncaba la
-- columna destino.
alter table public.ventas_items
  alter column cantidad type numeric(12,3) using cantidad::numeric(12,3);

-- Cantidad vendida de la cabecera. Ojo con qué significa: es la SUMA de
-- ventas_items.cantidad, y con venta por peso esa suma mezcla magnitudes
-- (0,750 kg de fiambre + 2 gaseosas = 2,750). Se decidió dejarla como un solo
-- número y cambiarle el label a "cantidad vendida" en vez de partirla en dos
-- columnas: separarlas es lo correcto conceptualmente pero obliga a
-- backfillear 1.032+ renglones para un número que hoy nadie lee desagregado
-- por rubro. Revisar cuando exista el primer comercio real de peso.
alter table public.ventas
  alter column cantidad type numeric(12,3) using cantidad::numeric(12,3);

-- Ingreso de mercadería: la carne entra por acá antes de venderse.
alter table public.ordenes_items
  alter column cantidad type numeric(12,3) using cantidad::numeric(12,3);

-- Bajas y mermas: la merma del corte es justamente decimal.
alter table public.bajas
  alter column cantidad type numeric(12,3) using cantidad::numeric(12,3);

comment on column public.producto_variantes.stock is
  'Stock en la unidad de medida del producto (productos.unidad_medida). numeric(12,3): 12.5 son 12,5 kg si el producto es KG, 12 unidades y media NO si es UNIDAD — quién acepta decimales lo decide el producto, no esta columna.';

comment on column public.ventas.cantidad is
  'Cantidad vendida = suma de ventas_items.cantidad. UNIDADES, no renglones (ver 20260816170000). Con venta por peso mezcla magnitudes: 0,750 kg + 2 unidades = 2,750. No es un total interpretable por sí solo cuando el comercio vende fraccionado.';

-- ---------------------------------------------------------------------------
-- 3. La función, ahora en numeric.
--
-- Misma semántica exacta que la versión integer, incluido el
-- `p_permitir_negativo` y el `SET search_path TO ''` (por eso todo va
-- calificado con public.). La condición `stock + p_delta >= 0` sigue siendo el
-- equivalente atómico de "hay stock suficiente" cuando p_delta = -cantidad, y
-- rechaza la fila (0 rows) si no alcanza. Esa fila devuelta es lo que
-- create-sale.ts chequea para decidir si la venta sigue.
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_stock_variante(
  p_variante_id uuid,
  p_delta numeric,
  p_permitir_negativo boolean default false
)
returns table(id uuid, stock numeric)
language sql
set search_path to ''
as $function$
  UPDATE public.producto_variantes
  SET stock = stock + p_delta
  WHERE producto_variantes.id = p_variante_id
    AND (p_permitir_negativo OR producto_variantes.stock + p_delta >= 0)
  RETURNING producto_variantes.id, producto_variantes.stock;
$function$;

-- Se reproducen los grants que la función tenía ANTES del drop, para que esta
-- migración no cambie de paso quién la puede llamar. El freno real es la RLS:
-- la función es SECURITY INVOKER, así que sin policy de UPDATE sobre
-- producto_variantes no escribe nadie — anon puede ejecutarla y no puede mover
-- un gramo.
grant execute on function public.ajustar_stock_variante(uuid, numeric, boolean)
  to public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Guards. La migración falla si algo quedó a medias.
--
-- Mismo criterio que el guard de formas de policy en 20260816100000: una
-- migración que "funciona" pero deja el sistema en un estado intermedio es
-- peor que una que no aplica.
-- ---------------------------------------------------------------------------
do $$
declare
  v_pendientes text;
  v_sobrecargas int;
begin
  -- 4a. Las 7 columnas quedaron en numeric.
  select string_agg(table_name || '.' || column_name, ', ')
    into v_pendientes
  from information_schema.columns
  where table_schema = 'public'
    and data_type <> 'numeric'
    and (
      (table_name = 'producto_variantes' and column_name in ('stock', 'stock_minimo'))
      or (table_name = 'productos_stock' and column_name = 'cantidad')
      or (table_name = 'ventas_items'    and column_name = 'cantidad')
      or (table_name = 'ventas'          and column_name = 'cantidad')
      or (table_name = 'ordenes_items'   and column_name = 'cantidad')
      or (table_name = 'bajas'           and column_name = 'cantidad')
    );

  if v_pendientes is not null then
    raise exception 'Quedaron columnas de cantidad sin pasar a numeric: %', v_pendientes;
  end if;

  -- 4b. Quedó UNA sola ajustar_stock_variante. Si quedaron dos, la de integer
  -- sigue viva y va a truncar pesos en silencio cuando PostgREST la elija.
  select count(*) into v_sobrecargas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ajustar_stock_variante';

  if v_sobrecargas <> 1 then
    raise exception
      'ajustar_stock_variante quedó con % versiones; tiene que haber exactamente 1 (la de numeric)',
      v_sobrecargas;
  end if;
end;
$$;
