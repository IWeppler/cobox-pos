-- ---------------------------------------------------------------------------
-- `aprobar_orden_compra` acepta cantidades decimales.
--
-- Va en su propio archivo, después de 20260819120000: esa migración cambia
-- tipos de columna y esta cambia el cuerpo de una función. Separadas se
-- revisan y se revierten de a una; juntas, un problema en cualquiera de las
-- dos obliga a deshacer todo.
--
-- QUÉ ESTABA MAL
-- La función declaraba `v_cantidad integer` y parseaba con
-- `(v_item->>'cantidad')::integer`. Aunque la columna ya sea numeric, ese
-- casteo sigue siendo el techo: una línea de remito con 12,5 kg entra como
-- texto '12.5' y `'12.5'::integer` es un error de Postgres, no un redondeo.
--
-- O sea que FALLA FUERTE, no en silencio — que es la mitad buena de la
-- noticia: hoy nadie puede cargar mercadería por peso, pero tampoco hay
-- ningún remito histórico al que se le haya truncado una cantidad sin avisar.
-- El ingreso es donde la carne entra ANTES de poder venderse, así que sin este
-- cambio la Fase 2 no tiene de dónde sacar stock decimal.
--
-- Lo ÚNICO que cambia respecto de 20260814230000 son esas dos líneas. El resto
-- del cuerpo va idéntico a propósito: el guard de idempotencia, el orden de
-- las escrituras y el espejo legacy no se tocan en una migración de tipos.
-- ---------------------------------------------------------------------------
create or replace function public.aprobar_orden_compra(p_orden_id uuid, p_proveedor text, p_items jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_item_id uuid;
  v_raw_nombre text;
  v_estado_match text;
  v_variante text;
  v_atributos jsonb;
  v_sku text;
  -- CAMBIO 1/2: era `integer`. Con integer, 12,5 kg de carne no entra.
  v_cantidad numeric(12,3);
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;

  v_variante_id uuid;
  v_stock_id uuid;
  v_estado_actual text;

  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  -- Estos DOS siguen siendo integer y está bien: cuentan líneas y variantes
  -- creadas, no mercadería. Media línea de remito no existe.
  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
begin
  -- GUARD DE IDEMPOTENCIA. Antes del loop: si esta orden ya estaba
  -- aprobada, se sale sin haber tocado stock ni precios ni alias.
  update ordenes_compra
  set estado = 'APROBADA'
  where id = p_orden_id
    and estado <> 'APROBADA';

  if not found then
    select estado into v_estado_actual
    from ordenes_compra
    where id = p_orden_id;

    if v_estado_actual is null then
      raise exception 'Orden % no encontrada o sin permiso para aprobarla', p_orden_id;
    end if;

    return jsonb_build_object(
      'ya_aprobada', true,
      'lineas_impactadas', 0,
      'productos_actualizados', 0,
      'variantes_creadas', 0,
      'alias_registrados', 0
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    if v_producto_id is null then
      continue;
    end if;

    v_item_id      := nullif(v_item->>'item_id', '')::uuid;
    v_raw_nombre   := coalesce(v_item->>'raw_nombre', '');
    v_estado_match := v_item->>'estado_match';
    v_variante     := coalesce(nullif(v_item->>'variante', ''), 'Unico');
    v_atributos    := coalesce(v_item->'atributos', '{}'::jsonb);
    v_sku          := nullif(trim(coalesce(v_item->>'sku', '')), '');
    -- CAMBIO 2/2: era `::integer`, que sobre el texto '12.5' no redondea sino
    -- que levanta "invalid input syntax for type integer".
    v_cantidad     := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

    -- LO QUE FALTABA: a qué producto fue esta línea.
    if v_item_id is not null then
      update ordenes_items
      set producto_id = v_producto_id,
          variante_match = v_variante
      where id = v_item_id;
    end if;

    if not (v_producto_id = any (v_productos_actualizados)) then
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

      v_productos_actualizados := v_productos_actualizados || v_producto_id;
      v_precio_base_por_producto := v_precio_base_por_producto
        || jsonb_build_object(v_producto_id::text, coalesce(v_precio_venta, 0));
    end if;

    v_precio_base := coalesce(
      (v_precio_base_por_producto->>v_producto_id::text)::numeric,
      0
    );

    select id into v_variante_id
    from producto_variantes
    where producto_id = v_producto_id
      and nombre_display = v_variante
    limit 1;

    if v_variante_id is not null then
      update producto_variantes
      set
        stock = stock + v_cantidad,
        atributos = v_atributos,
        sku = coalesce(v_sku, sku),
        updated_at = now()
      where id = v_variante_id;
    else
      v_difiere_precio := coalesce(v_precio_venta, 0) is distinct from v_precio_base;

      insert into producto_variantes (
        producto_id, nombre_display, atributos, sku, precio, costo, stock
      )
      values (
        v_producto_id,
        v_variante,
        v_atributos,
        v_sku,
        case when v_difiere_precio then v_precio_venta else null end,
        case when v_difiere_precio then v_precio_costo else null end,
        v_cantidad
      );

      v_variantes_creadas := v_variantes_creadas + 1;
    end if;

    -- Espejo legacy productos_stock: se mantiene sincronizado, y su texto
    -- de variante NUNCA se normaliza.
    select id into v_stock_id
    from productos_stock
    where producto_id = v_producto_id
      and variante = v_variante
    limit 1;

    if v_stock_id is not null then
      update productos_stock
      set cantidad = cantidad + v_cantidad
      where id = v_stock_id;
    else
      insert into productos_stock (producto_id, variante, cantidad)
      values (v_producto_id, v_variante, v_cantidad);
    end if;

    -- Diccionario de alias: una sola vez por nombre crudo.
    if v_estado_match in ('DESCONOCIDO', 'NUEVO_ALIAS') then
      v_alias_key := lower(trim(v_raw_nombre));
      if not (v_alias_key = any (v_alias_registrados)) then
        insert into diccionario_alias (proveedor, raw_nombre, producto_id)
        values (p_proveedor, v_alias_key, v_producto_id)
        on conflict (negocio_id, proveedor, raw_nombre)
        do update set producto_id = excluded.producto_id;

        v_alias_registrados := v_alias_registrados || v_alias_key;
      end if;
    end if;

    v_lineas := v_lineas + 1;
  end loop;

  return jsonb_build_object(
    'ya_aprobada', false,
    'lineas_impactadas', v_lineas,
    'productos_actualizados', coalesce(array_length(v_productos_actualizados, 1), 0),
    'variantes_creadas', v_variantes_creadas,
    'alias_registrados', coalesce(array_length(v_alias_registrados, 1), 0)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO ARREGLA, A PROPÓSITO: importar_productos_planilla.
--
-- Esa RPC tiene el mismo problema (`v_stock integer`, `v_stock_final integer`,
-- `(v_item->>'stock')::integer`) y NO se toca acá porque quedó SIN punto de
-- entrada al unificar el ingreso de mercadería (ver CLAUDE.md): hoy es código
-- muerto. Reproducir 280 líneas de una función que nadie llama, en una
-- migración que toca los 4 negocios, es riesgo sin beneficio.
--
-- Ojo con una diferencia: después de 20260819120000, `v_stock_final integer`
-- recibe el valor de una columna numeric, y ahí sí redondea EN SILENCIO en vez
-- de fallar. Sigue sin impacto porque la función no se ejecuta, pero es la
-- razón por la que no puede quedar así para siempre.
--
-- La decisión pendiente es cuál de las dos: arreglarla o borrarla. Borrarla es
-- probablemente lo correcto —el flujo nuevo ya la reemplazó— pero eso es una
-- limpieza, no parte de la venta por peso. Entra en la Fase 2.
-- ---------------------------------------------------------------------------
