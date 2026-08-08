-- Importación de planilla de productos: escribir el archivo entero en UNA
-- sola llamada, dentro de una transacción.
--
-- Antes, confirmarImportProductosAction recorría las filas con un `for` con
-- `await` adentro y hacía hasta 5 round-trips por fila (crear producto,
-- crear variante, insertar relaciones de atributos, insertar IMEI, RPC de
-- stock) más un select+update por fila para el espejo legacy
-- productos_stock. Con el tope de 3000 filas eso son ~10.000 viajes
-- secuenciales, y si el proceso se cortaba a la mitad quedaba la mitad del
-- archivo escrito, sin registro de dónde había quedado.
--
-- Mismo criterio que aprobar_orden_compra (20260728120000): el ciclo corre
-- entero dentro de Postgres. Gana tres cosas:
--
--   * El stock se suma con UPDATE atómico condicional (stock + n >= 0),
--     nunca leyendo-modificando-escribiendo desde Node.
--   * Cada fila es atómica: el bloque BEGIN/EXCEPTION por ítem funciona como
--     savepoint, así que una fila que falla no deja producto sin variante ni
--     IMEI sin stock. Las demás filas siguen, que es el comportamiento que
--     ya esperaba la UI (reporte fila por fila).
--   * Si la llamada entera muere (timeout, red, deploy), no se escribió
--     NADA. Antes quedaba a medio camino.
--
-- La canonicalización de atributos NO se replica acá: sigue viviendo en Node
-- (canonicalizarValores / construirCacheAtributos, compartido con la carga
-- manual y con el merge de remitos). Esta función recibe `atributos` ya
-- canonicalizado, el `nombre_display` y el `slug` ya calculados, y las
-- relaciones atributo/valor ya resueltas a ids.
--
-- SECURITY INVOKER a propósito, igual que las otras: la acción corre con el
-- cliente de cookies del usuario y las RLS de productos / producto_variantes
-- / productos_stock / unidades_serie tienen que seguir gobernando.

create or replace function public.importar_productos_planilla(
  p_negocio_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_item jsonb;

  v_fila integer;
  v_producto_nombre text;
  v_clave_producto text;
  v_clave_variante text;
  v_producto_id uuid;
  v_variante_id uuid;
  v_nombre_display text;
  v_imei text;
  v_stock integer;
  v_stock_final integer;
  v_sku text;
  v_rows integer;

  v_ok boolean;
  v_detalle text;

  -- Estado acumulado del propio archivo: lo que una fila anterior ya creó.
  -- Reemplazan a los Map de la versión en Node.
  v_producto_por_clave jsonb := '{}'::jsonb;
  v_variante_por_clave jsonb := '{}'::jsonb;

  v_resultados jsonb := '[]'::jsonb;
  v_productos_creados integer := 0;
  v_variantes_creadas integer := 0;
begin
  if p_negocio_id is null then
    raise exception 'importar_productos_planilla requiere un negocio activo';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_fila := coalesce((v_item->>'fila')::integer, 0);
    v_producto_nombre := coalesce(v_item->>'producto', '');
    v_ok := true;
    v_detalle := '';

    begin
      v_clave_producto := coalesce(v_item->>'clave_producto', '');
      v_clave_variante := coalesce(v_item->>'clave_variante', '');
      v_imei := nullif(trim(coalesce(v_item->>'imei', '')), '');
      v_stock := coalesce((v_item->>'stock')::integer, 0);
      v_sku := nullif(trim(coalesce(v_item->>'codigo_barras', '')), '');

      -- 1. Producto: el que ya existía, el que creó una fila anterior del
      --    mismo archivo, o uno nuevo.
      v_producto_id := nullif(v_item->>'producto_id', '')::uuid;

      if v_producto_id is null then
        v_producto_id := nullif(v_producto_por_clave->>v_clave_producto, '')::uuid;
      end if;

      if v_producto_id is null then
        insert into public.productos (
          negocio_id, nombre, tipo, categoria_id, descripcion,
          precio, precio_costo, slug, publicado, atributos_globales
        )
        values (
          p_negocio_id,
          v_producto_nombre,
          coalesce(nullif(v_item->>'categoria_nombre', ''), 'General'),
          nullif(v_item->>'categoria_id', '')::uuid,
          '',
          coalesce((v_item->>'precio_venta')::numeric, 0),
          coalesce((v_item->>'precio_costo')::numeric, 0),
          v_item->>'slug',
          true,
          '{}'::jsonb
        )
        returning id into v_producto_id;

        v_producto_por_clave := v_producto_por_clave
          || jsonb_build_object(v_clave_producto, v_producto_id::text);
        v_productos_creados := v_productos_creados + 1;
      else
        -- Defensa en profundidad: un producto_id de otro negocio no entra
        -- acá aunque el payload lo mande. Las policies son el freno real.
        perform 1 from public.productos
         where id = v_producto_id and negocio_id = p_negocio_id;
        if not found then
          raise exception 'El producto no pertenece al negocio activo';
        end if;
      end if;

      -- 2. Variante: misma lógica de tres fuentes que el producto.
      v_variante_id := nullif(v_item->>'variante_id', '')::uuid;

      if v_variante_id is null then
        v_variante_id := nullif(
          v_variante_por_clave->>(v_producto_id::text || '::' || v_clave_variante),
          ''
        )::uuid;
      end if;

      if v_variante_id is null then
        insert into public.producto_variantes (
          negocio_id, producto_id, nombre_display, atributos,
          precio, costo, stock, sku
        )
        values (
          p_negocio_id,
          v_producto_id,
          coalesce(nullif(v_item->>'nombre_display', ''), 'Único'),
          coalesce(v_item->'atributos', '{}'::jsonb),
          null,
          null,
          0,
          v_sku
        )
        returning id into v_variante_id;

        insert into public.producto_variante_valores (
          negocio_id, variante_id, atributo_id, atributo_valor_id
        )
        select
          p_negocio_id,
          v_variante_id,
          (rel->>'atributo_id')::uuid,
          (rel->>'atributo_valor_id')::uuid
        from jsonb_array_elements(coalesce(v_item->'relaciones', '[]'::jsonb)) as rel;

        v_variante_por_clave := v_variante_por_clave
          || jsonb_build_object(
               v_producto_id::text || '::' || v_clave_variante,
               v_variante_id::text
             );
        v_variantes_creadas := v_variantes_creadas + 1;
      end if;

      -- El nombre de variante para el espejo legacy se lee de la base, no
      -- del payload: productos_stock se relaciona por (producto_id, texto de
      -- variante) y ese texto NUNCA se normaliza. Sirve además de guard de
      -- negocio para la variante existente.
      select nombre_display into v_nombre_display
        from public.producto_variantes
       where id = v_variante_id and negocio_id = p_negocio_id;

      if v_nombre_display is null then
        raise exception 'La variante no pertenece al negocio activo';
      end if;

      -- 3. IMEI: el índice único (negocio_id, imei) es el que decide. Un
      --    duplicado NO es excepción, es un resultado esperado de la fila.
      if v_imei is not null then
        insert into public.unidades_serie (
          negocio_id, producto_variante_id, imei, estado
        )
        values (p_negocio_id, v_variante_id, v_imei, 'disponible')
        on conflict (negocio_id, imei) do nothing;

        get diagnostics v_rows = row_count;

        if v_rows = 0 then
          v_ok := false;
          v_detalle := 'El IMEI ' || v_imei
            || ' ya estaba cargado; no se sumó stock.';
        end if;
      end if;

      -- 4. Stock: UPDATE atómico condicional. Mismo criterio que
      --    ajustar_stock_variante, pero sin un round-trip por fila.
      if v_ok then
        update public.producto_variantes
           set stock = stock + v_stock,
               updated_at = now()
         where id = v_variante_id
           and negocio_id = p_negocio_id
           and stock + v_stock >= 0
        returning stock into v_stock_final;

        if not found then
          v_ok := false;
          v_detalle := 'No se pudo ajustar el stock (la variante ya no existe o el stock quedaría negativo).';
        else
          -- Espejo legacy: se escribe el stock FINAL, no un delta, porque
          -- la fuente canónica es producto_variantes.
          insert into public.productos_stock (
            negocio_id, producto_id, variante, cantidad
          )
          values (p_negocio_id, v_producto_id, v_nombre_display, v_stock_final)
          on conflict (producto_id, variante)
          do update set cantidad = excluded.cantidad;

          if v_imei is not null then
            v_detalle := 'IMEI ' || v_imei || ' cargado (+1, stock '
              || v_stock_final || ').';
          else
            v_detalle := '+' || v_stock || ' unidades (stock '
              || v_stock_final || ').';
          end if;
        end if;
      end if;

    exception when others then
      -- Rollback al savepoint implícito de este bloque: la fila entera se
      -- deshace (producto y variante incluidos) y el archivo sigue.
      v_ok := false;
      v_detalle := coalesce(sqlerrm, 'Error inesperado al procesar la fila.');
    end;

    v_resultados := v_resultados || jsonb_build_object(
      'fila', v_fila,
      'producto', v_producto_nombre,
      'ok', v_ok,
      'detalle', v_detalle
    );
  end loop;

  return jsonb_build_object(
    'resultados', v_resultados,
    'productos_creados', v_productos_creados,
    'variantes_creadas', v_variantes_creadas
  );
end;
$$;

comment on function public.importar_productos_planilla(uuid, jsonb) is
  'Importa una planilla de productos completa (productos + variantes + '
  'relaciones de atributos + IMEI + stock + espejo legacy) en una sola '
  'transacción, con cada fila atómica. Reemplaza el loop con await por fila '
  'de confirmarImportProductosAction. Recibe atributos YA canonicalizados, '
  'nombre_display y slug ya calculados desde Node.';
