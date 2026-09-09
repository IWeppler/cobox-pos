-- ============================================================================
-- EL REMITO YA NO DEJA EL PRECIO A MEDIO CAMBIAR, Y DEJA RASTRO
-- ============================================================================
--
-- Dos agujeros del mismo bug, reportado por Evelyn el 8/9/2026 sobre
-- "Pantalon sastrero HHP": el producto mostraba $52.000 en /stock y la caja
-- iba a cobrar $20.000.
--
-- 1. `aprobar_orden_compra_impl` escribía `productos.precio` pero sobre una
--    variante que YA existía solo hacía `stock = stock + cantidad`. Como en la
--    venta gana la variante (`variante.precio ?? producto.precio`), aprobar un
--    remito cambiaba el precio que se MUESTRA y no el que se COBRA. Quedaron
--    así 16 productos en Evens, 12 en Estilo Bonito y 2 en Kiosco Demo.
--
--    Ahora se alinea la variante cuyo precio propio era una COPIA del precio
--    que se estaba cobrando: eso no es un precio especial, es el mismo número
--    guardado dos veces. La variante que decía otra cosa se respeta y se
--    CUENTA, y la cuenta vuelve en el resultado para que la pantalla lo avise.
--
--    La comparación va contra el precio EFECTIVO viejo (el de las variantes
--    cuando todas coinciden — ver 20260908180000), no contra el de cabecera.
--    Contra el de cabecera, los 30 productos ya desalineados no matchearían
--    nunca y se quedarían desalineados para siempre, que es justo el estado
--    del que hay que salir.
--
-- 2. Un cambio de precio hecho por un remito no dejaba NINGUNA fila en
--    `actualizaciones_precio(_items)`: esa tabla la escribía únicamente la
--    actualización masiva (`update-prices.ts`). Por eso, al auditar el caso de
--    Evelyn, no se pudo fechar cuándo había cambiado el precio: la única
--    escritura con fecha era `productos.updated_at`, que pisa cualquier
--    guardado posterior. Plata que se mueve sin registro.
--
--    Ahora el remito abre su propio lote (`tipo_operacion = 'REMITO'`), con
--    una fila por producto y una por cada variante que alinea. El lote se crea
--    PEREZOSO: un remito que no mueve ningún precio no ensucia el historial.
--    Como es el mismo formato que ya usa el ajuste masivo, "Deshacer" en el
--    historial de precios funciona sobre un remito sin escribir una línea más.
--
-- CÓMO SE REESCRIBE. Desde el cuerpo VIVO (`pg_get_functiondef`), nunca desde
-- el último archivo que lo tocó: `create or replace function` no avisa de
-- nada, y así fue como 20260819180039 se llevó puestas la creación de
-- `unidades_serie` y el guard de atributos (restauradas en 20260904140000).
-- Cada ancla se verifica ÚNICA antes de reemplazar, y al final un guard
-- comprueba que sobrevivió todo lo que tenía que sobrevivir.
--
-- LO QUE ESTA MIGRACIÓN NO HACE: reparar los 30 productos que ya están
-- desalineados. Cuál de los dos precios gana en cada uno es una decisión del
-- comercio —en 15 de los 16 de Evens la cabecera es exactamente el doble del
-- costo, o sea un repricing que nunca llegó a la caja— y una migración no la
-- puede tomar por él.
-- ============================================================================

do $$
declare
  v_def text;
  v_ancla text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'aprobar_orden_compra_impl';

  if v_def is null then
    raise exception 'GUARD: no existe public.aprobar_orden_compra_impl';
  end if;

  -- ---------------------------------------------------------------- ANCLA 1
  -- Declaraciones nuevas.
  v_ancla := '  v_lineas integer := 0;';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla de declaraciones no aparece exactamente una vez';
  end if;

  v_nuevo :=
'  v_lote_id uuid;
  v_precio_viejo numeric;
  v_costo_viejo numeric;
  v_precio_efectivo numeric;
  v_costo_efectivo numeric;
  v_precio_final numeric;
  v_costo_final numeric;
  v_filas integer;
  v_productos_reprecio integer := 0;
  v_variantes_alineadas integer := 0;
  v_variantes_conservadas integer := 0;

  v_lineas integer := 0;';

  v_def := replace(v_def, v_ancla, v_nuevo);

  -- ---------------------------------------------------------------- ANCLA 2
  -- El bloque que escribe el precio del producto.
  v_ancla :=
'    if not (v_producto_id = any (v_productos_actualizados)) then
      if coalesce(v_precio_costo, 0) <> 0 or coalesce(v_precio_venta, 0) <> 0 then
        update productos
        set
          precio_costo = case
            when coalesce(v_precio_costo, 0) <> 0 then v_precio_costo
            else precio_costo
          end,
          precio = case
            when coalesce(v_precio_venta, 0) <> 0 then v_precio_venta
            else precio
          end
        where id = v_producto_id;
      end if;
';

  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla del update de precios no aparece exactamente una vez';
  end if;

  v_nuevo :=
'    if not (v_producto_id = any (v_productos_actualizados)) then
      if coalesce(v_precio_costo, 0) <> 0 or coalesce(v_precio_venta, 0) <> 0 then
        -- El precio viejo se lee DOS veces: el de cabecera (lo que hay que
        -- auditar) y el EFECTIVO (lo que se estaba cobrando). En 30 productos
        -- no son el mismo numero. Misma expresion que la vista
        -- productos_precio_efectivo, 20260908180000.
        select
          p.precio,
          p.precio_costo,
          case
            when v.total > 0 and v.con_precio = v.total and v.precios_distintos = 1
              then v.precio_unico
            else p.precio
          end,
          case
            when v.total > 0 and v.con_costo = v.total and v.costos_distintos = 1
              then v.costo_unico
            else p.precio_costo
          end
          into v_precio_viejo, v_costo_viejo, v_precio_efectivo, v_costo_efectivo
        from productos p
        left join lateral (
          select
            count(*)                  as total,
            count(pv.precio)          as con_precio,
            count(distinct pv.precio) as precios_distintos,
            min(pv.precio)            as precio_unico,
            count(pv.costo)           as con_costo,
            count(distinct pv.costo)  as costos_distintos,
            min(pv.costo)             as costo_unico
          from producto_variantes pv
          where pv.producto_id = p.id
        ) v on true
        where p.id = v_producto_id;

        v_precio_final := case
          when coalesce(v_precio_venta, 0) <> 0 then v_precio_venta
          else v_precio_viejo
        end;
        v_costo_final := case
          when coalesce(v_precio_costo, 0) <> 0 then v_precio_costo
          else v_costo_viejo
        end;

        update productos
        set precio_costo = v_costo_final,
            precio = v_precio_final
        where id = v_producto_id;

        if v_precio_final is distinct from v_precio_viejo
           or v_costo_final is distinct from v_costo_viejo
        then
          -- Lote perezoso: un remito que no mueve ningun precio no deja fila.
          if v_lote_id is null then
            insert into actualizaciones_precio (
              negocio_id, nombre, tipo_alcance, tipo_operacion,
              campo_objetivo, valor, redondeo, cantidad_afectada, creado_por
            )
            values (
              coalesce(v_negocio_id, security.current_negocio_id()),
              ''Ingreso de mercaderia - '' || coalesce(nullif(trim(p_proveedor), ''''), ''sin proveedor''),
              ''REMITO'', ''REMITO'', ''AMBOS'', 0, ''SIN_REDONDEO'', 0, auth.uid()
            )
            returning id into v_lote_id;
          end if;

          insert into actualizaciones_precio_items (
            negocio_id, lote_id, producto_id, variante_id,
            costo_anterior, costo_nuevo, precio_anterior, precio_nuevo
          )
          values (
            coalesce(v_negocio_id, security.current_negocio_id()),
            v_lote_id, v_producto_id, null,
            coalesce(v_costo_viejo, 0), coalesce(v_costo_final, 0),
            coalesce(v_precio_viejo, 0), coalesce(v_precio_final, 0)
          );

          v_productos_reprecio := v_productos_reprecio + 1;

          -- La auditoria de las variantes va ANTES del update: despues, el
          -- valor anterior ya no esta en ningun lado.
          insert into actualizaciones_precio_items (
            negocio_id, lote_id, producto_id, variante_id,
            costo_anterior, costo_nuevo, precio_anterior, precio_nuevo
          )
          select
            coalesce(v_negocio_id, security.current_negocio_id()),
            v_lote_id, v_producto_id, pv.id,
            coalesce(pv.costo, 0),
            coalesce(case when pv.costo = v_costo_efectivo then v_costo_final else pv.costo end, 0),
            coalesce(pv.precio, 0),
            coalesce(case when pv.precio = v_precio_efectivo then v_precio_final else pv.precio end, 0)
          from producto_variantes pv
          where pv.producto_id = v_producto_id
            and (
              (pv.precio = v_precio_efectivo and pv.precio is distinct from v_precio_final)
              or (pv.costo = v_costo_efectivo and pv.costo is distinct from v_costo_final)
            );

          -- Solo la variante cuyo precio propio era una COPIA del que se
          -- cobraba. La que decia otra cosa es un precio especial y se
          -- respeta. `pv.precio = v_precio_efectivo` ya descarta los NULL:
          -- esos heredan de la cabecera y no hay nada que mover.
          update producto_variantes pv
          set precio = case
                when pv.precio = v_precio_efectivo then v_precio_final
                else pv.precio
              end,
              costo = case
                when pv.costo = v_costo_efectivo then v_costo_final
                else pv.costo
              end,
              updated_at = now()
          where pv.producto_id = v_producto_id
            and (
              (pv.precio = v_precio_efectivo and pv.precio is distinct from v_precio_final)
              or (pv.costo = v_costo_efectivo and pv.costo is distinct from v_costo_final)
            );

          get diagnostics v_filas = row_count;
          v_variantes_alineadas := v_variantes_alineadas + v_filas;

          select count(*)
            into v_filas
          from producto_variantes pv
          where pv.producto_id = v_producto_id
            and pv.precio is not null
            and pv.precio is distinct from v_precio_final;

          v_variantes_conservadas := v_variantes_conservadas + v_filas;
        end if;
      end if;
';

  v_def := replace(v_def, v_ancla, v_nuevo);

  -- ---------------------------------------------------------------- ANCLA 3
  -- Cierre del lote y contadores nuevos en el resultado.
  v_ancla :=
'  return jsonb_build_object(
    ''ya_aprobada'', false,';

  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla del return final no aparece exactamente una vez';
  end if;

  v_nuevo :=
'  if v_lote_id is not null then
    update actualizaciones_precio
    set cantidad_afectada = v_productos_reprecio
    where id = v_lote_id;
  end if;

  return jsonb_build_object(
    ''ya_aprobada'', false,';

  v_def := replace(v_def, v_ancla, v_nuevo);

  v_ancla :=
'    ''imeis_creados'', v_imeis_creados
  );';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla de contadores no aparece exactamente una vez';
  end if;

  v_nuevo :=
'    ''imeis_creados'', v_imeis_creados,
    ''productos_reprecio'', v_productos_reprecio,
    ''variantes_alineadas'', v_variantes_alineadas,
    ''variantes_conservadas'', v_variantes_conservadas
  );';

  v_def := replace(v_def, v_ancla, v_nuevo);

  -- ---------------------------------------------------------------- ANCLA 4
  -- La misma forma en la salida idempotente: el cliente lee las mismas claves
  -- venga de una aprobacion real o de la segunda.
  v_ancla :=
'      ''alias_registrados'', 0,
      ''imeis_creados'', 0
    );';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla del retorno idempotente no aparece exactamente una vez';
  end if;

  v_nuevo :=
'      ''alias_registrados'', 0,
      ''imeis_creados'', 0,
      ''productos_reprecio'', 0,
      ''variantes_alineadas'', 0,
      ''variantes_conservadas'', 0
    );';

  v_def := replace(v_def, v_ancla, v_nuevo);

  execute v_def;
end $$;

-- ============================================================================
-- GUARD: lo que tenia que sobrevivir a la reescritura.
-- Mismo criterio que 20260904140000 y que el guard de policies de
-- 20260816100000: si el cuerpo vivo pierde una de estas piezas, la migracion
-- falla ahora en vez de descubrirse meses despues con los numeros ya mal.
-- ============================================================================
do $$
declare
  v_def text;
  v_pieza text;
  v_faltan text[] := '{}';
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'aprobar_orden_compra_impl';

  foreach v_pieza in array array[
    -- lo que agrega esta migracion
    'actualizaciones_precio',
    'v_precio_efectivo',
    'variantes_conservadas',
    -- lo que ya estaba y no se puede perder (ver 20260904140000)
    'unidades_serie',
    'REMITO_VARIANTE_COLISION',
    'REMITO_SIN_LINEAS_IMPACTABLES',
    'REMITO_LINEAS_SIN_PRODUCTO',
    'diccionario_alias',
    'atributos_comparables',
    'ya_aprobada'
  ]
  loop
    if position(v_pieza in v_def) = 0 then
      v_faltan := v_faltan || v_pieza;
    end if;
  end loop;

  if array_length(v_faltan, 1) > 0 then
    raise exception
      'GUARD: aprobar_orden_compra_impl quedo sin %', array_to_string(v_faltan, ', ');
  end if;
end $$;

comment on function public.aprobar_orden_compra_impl(uuid, text, jsonb) is
  'Impacta un remito: precios, stock, variantes, IMEI y alias, en una transaccion. Desde 20260908190000 tambien alinea el precio propio de las variantes que era copia del vigente, y audita el cambio en actualizaciones_precio(_items) con tipo_operacion REMITO.';
