-- ---------------------------------------------------------------------------
-- `registrar_venta` congela con qué lista de precios se cobró la venta.
--
-- POR QUÉ HACE FALTA UNA MIGRACIÓN. `20260908150000` agregó
-- `ventas.lista_precio_id` y `ventas.lista_precio_nombre`, pero la venta no
-- las escribe: el INSERT de `registrar_venta` tiene la lista de columnas
-- EXPLÍCITA, así que una columna nueva simplemente queda en null para siempre
-- y nadie se entera. Sin esto, el resto del punto 4 dejaría la lista aplicada
-- en el precio y sin ningún rastro de cuál fue.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE REESCRIBE, QUE ES LO IMPORTANTE
--
-- NO se retipea el cuerpo. Se lo lee de la base con `pg_get_functiondef`, se
-- le insertan las dos columnas por reemplazo de texto y se lo vuelve a
-- ejecutar. El cuerpo nunca sale de Postgres, así que no puede transcribirse
-- mal.
--
-- Esa precaución no es teórica: `20260819180039` reescribió esta familia de
-- funciones entera partiendo de una copia vieja y se llevó puestas dos cosas
-- que otra migración ya había agregado —la creación de `unidades_serie` y el
-- guard de atributos—. Las dos migraciones estaban aplicadas y ganó la última.
-- `create or replace function` no avisa de nada.
--
-- Los anclajes se verificaron ÚNICOS contra el cuerpo vivo antes de escribir
-- esto (una aparición cada uno), y el bloque falla si dejan de serlo.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def       text;
  v_nuevo     text;
  v_ancla_col constant text := E'desfasaje_precio\n  )\n  values (';
  v_ancla_val constant text := '(p_venta->>''desfasaje_precio'')::numeric';
  v_veces     integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_venta';

  if v_def is null then
    raise exception 'No existe public.registrar_venta';
  end if;

  if position('lista_precio_id' in v_def) > 0 then
    raise notice 'registrar_venta ya congela la lista de precios: no se toca.';
    return;
  end if;

  -- Los dos anclajes tienen que aparecer EXACTAMENTE una vez. Si el cuerpo
  -- cambió de forma, es preferible que esta migración falle a que inserte las
  -- columnas en el lugar equivocado.
  v_veces := (length(v_def) - length(replace(v_def, v_ancla_col, ''))) / length(v_ancla_col);
  if v_veces <> 1 then
    raise exception 'El ancla de columnas aparece % veces (se esperaba 1): el cuerpo de registrar_venta cambio de forma.', v_veces;
  end if;

  v_veces := (length(v_def) - length(replace(v_def, v_ancla_val, ''))) / length(v_ancla_val);
  if v_veces <> 1 then
    raise exception 'El ancla de valores aparece % veces (se esperaba 1).', v_veces;
  end if;

  v_nuevo := replace(
    v_def,
    v_ancla_col,
    E'desfasaje_precio,\n    lista_precio_id, lista_precio_nombre\n  )\n  values ('
  );

  -- `nullif` sobre el texto vacío: una venta sin lista manda '' o no manda
  -- nada, y las dos cosas tienen que terminar en NULL. NULL acá significa
  -- "se vendió al precio base", que es el caso de 7 de los 8 negocios.
  v_nuevo := replace(
    v_nuevo,
    v_ancla_val,
    E'(p_venta->>''desfasaje_precio'')::numeric,\n    nullif(p_venta->>''lista_precio_id'', '''')::uuid,\n    nullif(p_venta->>''lista_precio_nombre'', '''')'
  );

  execute v_nuevo;
end;
$$;

-- ---------------------------------------------------------------------------
-- GUARD: la reescritura agregó lo suyo y NO se llevó nada puesto.
--
-- Mismo criterio que el guard de `20260904140000`, que existe justamente
-- porque una reescritura silenciosa borró comportamiento probado.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def    text;
  v_pieza  text;
  v_faltan text[] := '{}';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_venta';

  foreach v_pieza in array array[
    'lista_precio_id',              -- lo que agrega esta migración
    'lista_precio_nombre',
    'venta_pagos',                  -- los cobros del ticket
    'ventas_items',                 -- los renglones
    'ventas_descuentos',            -- el descuento aplicado
    'cuenta_corriente_movimientos', -- la deuda del fiado
    'productos_stock',              -- el espejo legacy
    'usos_actuales',                -- el contador de la promoción
    'ya_registrada',                -- la idempotencia de la venta offline
    'SIN_NEGOCIO_ACTIVO'            -- el corte multi-tenant
  ]
  loop
    if position(v_pieza in v_def) = 0 then
      v_faltan := v_faltan || v_pieza;
    end if;
  end loop;

  if array_length(v_faltan, 1) is not null then
    raise exception 'registrar_venta quedo sin: %', array_to_string(v_faltan, ', ');
  end if;
end;
$$;

comment on column public.ventas.lista_precio_id is
  'Lista con la que se cobro esta venta, congelada por registrar_venta. SIN FK a proposito: el historial sobrevive a que la lista se borre. NULL = precio base, o venta anterior a las listas de precios.';
