-- importar_productos_planilla, ahora idempotente.
--
-- Cambia la firma: recibe el hash del contenido (ver hash-import-productos.ts),
-- el nombre del archivo y si el usuario pidió importar igual.
--
-- El guard va PRIMERO, antes de escribir una sola unidad de stock — mismo
-- orden que aprobar_orden_compra, y por el mismo motivo: el INSERT toma el
-- row lock que serializa dos importaciones concurrentes del mismo archivo. Un
-- `select` previo no serviría: dos llamadas simultáneas leerían "no existe"
-- las dos y las dos escribirían.
--
-- "Ya se importó" vuelve como resultado normal (`ya_importada: true` + los
-- datos del import anterior), no como excepción: la UI lo muestra y ofrece el
-- botón de importar igual, que reintenta con p_forzar = true.
--
-- La firma vieja de 2 argumentos se dropea: dejarla viva permitiría importar
-- sin guard desde cualquier cliente desactualizado.

drop function if exists public.importar_productos_planilla(uuid, jsonb);

create or replace function public.importar_productos_planilla(
  p_negocio_id uuid,
  p_items jsonb,
  p_hash text,
  p_nombre_archivo text default null,
  p_forzar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_item jsonb;

  v_importacion_id uuid;
  v_previa jsonb;

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

  v_producto_por_clave jsonb := '{}'::jsonb;
  v_variante_por_clave jsonb := '{}'::jsonb;

  v_resultados jsonb := '[]'::jsonb;
  v_productos_creados integer := 0;
  v_variantes_creadas integer := 0;
  v_filas_ok integer := 0;
begin
  if p_negocio_id is null then
    raise exception 'importar_productos_planilla requiere un negocio activo';
  end if;
  if coalesce(trim(p_hash), '') = '' then
    raise exception 'importar_productos_planilla requiere el hash del archivo';
  end if;

  -- ── GUARD DE IDEMPOTENCIA ─────────────────────────────────────────────
  -- Antes de tocar stock. Con p_forzar la fila se marca `forzada` y el
  -- unique parcial la deja pasar siempre.
  insert into public.importaciones_productos (
    negocio_id, hash, nombre_archivo, forzada, filas_totales, importado_por
  )
  values (
    p_negocio_id,
    p_hash,
    nullif(trim(coalesce(p_nombre_archivo, '')), ''),
    coalesce(p_forzar, false),
    jsonb_array_length(p_items),
    auth.uid()
  )
  on conflict do nothing
  returning id into v_importacion_id;

  if v_importacion_id is null then
    -- No se insertó: este archivo ya se importó y no vino p_forzar. NO se
    -- escribe nada; se devuelve el import anterior para que la UI lo cuente.
    select jsonb_build_object(
             'id', i.id,
             'creado_en', i.creado_en,
             'nombre_archivo', i.nombre_archivo,
             'filas_totales', i.filas_totales,
             'filas_ok', i.filas_ok,
             'filas_error', i.filas_error
           )
      into v_previa
      from public.importaciones_productos i
     where i.negocio_id = p_negocio_id
       and i.hash = p_hash
       and not i.forzada
     limit 1;

    return jsonb_build_object(
      'ya_importada', true,
      'importacion_previa', v_previa,
      'resultados', '[]'::jsonb,
      'productos_creados', 0,
      'variantes_creadas', 0
    );
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
        perform 1 from public.productos
         where id = v_producto_id and negocio_id = p_negocio_id;
        if not found then
          raise exception 'El producto no pertenece al negocio activo';
        end if;
      end if;

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

      select nombre_display into v_nombre_display
        from public.producto_variantes
       where id = v_variante_id and negocio_id = p_negocio_id;

      if v_nombre_display is null then
        raise exception 'La variante no pertenece al negocio activo';
      end if;

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
      v_ok := false;
      v_detalle := coalesce(sqlerrm, 'Error inesperado al procesar la fila.');
    end;

    if v_ok then
      v_filas_ok := v_filas_ok + 1;
    end if;

    v_resultados := v_resultados || jsonb_build_object(
      'fila', v_fila,
      'producto', v_producto_nombre,
      'ok', v_ok,
      'detalle', v_detalle
    );
  end loop;

  update public.importaciones_productos
     set filas_ok = v_filas_ok,
         filas_error = jsonb_array_length(p_items) - v_filas_ok
   where id = v_importacion_id;

  return jsonb_build_object(
    'ya_importada', false,
    'importacion_id', v_importacion_id,
    'resultados', v_resultados,
    'productos_creados', v_productos_creados,
    'variantes_creadas', v_variantes_creadas
  );
end;
$$;

comment on function public.importar_productos_planilla(uuid, jsonb, text, text, boolean) is
  'Importa una planilla completa en una sola transacción, con cada fila '
  'atómica y con guard de idempotencia por (negocio_id, hash) ANTES de '
  'escribir stock. Devuelve {ya_importada: true} cuando el archivo ya se '
  'importó y no vino p_forzar. Recibe atributos YA canonicalizados desde Node.';
