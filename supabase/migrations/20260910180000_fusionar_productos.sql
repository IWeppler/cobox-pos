-- ============================================================================
-- FUSIONAR DOS PRODUCTOS QUE SON EL MISMO
-- ============================================================================
--
-- El 10/9/2026 un remito creó "REMERONES VANIC OVERSIZE" cuando ese producto
-- ya existía desde el 11/8, con el nombre EXACTAMENTE igual. Lo arreglé a mano
-- con una migración (`20260910170000`), y eso es justamente el problema: la
-- dueña no puede escribir SQL, así que hasta hoy un duplicado se quedaba para
-- siempre o se resolvía borrando uno de los dos y perdiendo su stock.
--
-- Quedan 11 duplicados reales en el SaaS, contados por nombre + categoría +
-- marca. Contarlos solo por nombre da 42 y está mal: la misma "REMERA BASICA"
-- en HOMBRE y en MUJER son dos productos distintos, y la misma prenda de dos
-- marcas también.
--
-- ─────────────────────────────────────────────────────────────────────────
-- FUSIONAR NO ES MOVER, Y ESE ES TODO EL PROBLEMA
--
-- Cuando las dos partes tienen la MISMA variante (mismo talle y color), no se
-- puede mover: `idx_variante_identidad` es único por
-- (negocio, producto, atributos_comparables) y el UPDATE falla con 23505. Hay
-- que sumar el stock en la que queda y borrar la otra. En el caso Vanic pasó
-- con 1 de 4 variantes.
--
-- El emparejamiento va por `atributos_comparables` y NUNCA por
-- `nombre_display`: un producto guardaba "TALLE: M / COLOR: NATURAL" y el otro
-- "Talle: M / Color: NATURAL". Por nombre no matchean y el UPDATE revienta
-- contra el índice.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE HAY QUE SALVAR ANTES DE BORRAR
--
-- 13 tablas apuntan a `productos.id`, y el borrado NO es inofensivo:
--
--   * 9 son ON DELETE CASCADE — historial de precios, alias del proveedor,
--     promociones, reservas, bajas y la auditoría de variantes se irían con el
--     producto. Todas se reapuntan al destino primero.
--   * `ventas_items` y `ordenes_items` son ON DELETE SET NULL, que es peor:
--     no se borran, quedan en null SIN AVISAR. Es el mismo éxito silencioso
--     que dejó 109 líneas de remito huérfanas y costó un día de trabajo el
--     5/9. Se reapuntan las dos.
--   * `movimientos_stock` NO se toca: es append-only y es la historia de lo
--     que pasó. Que un movimiento viejo apunte a un producto que ya no existe
--     es correcto — existía cuando la mercadería se movió.
--
-- `ventas_items.variante_id` merece su propio párrafo: no tiene FK, así que
-- borrar la variante que se suma dejaría el renglón apuntando a la nada y la
-- anulación de esa venta volvería a depender del match por nombre, que es
-- exactamente lo que `20260816130000` vino a sacar del medio. Por eso se
-- reapunta a la gemela ANTES del borrado.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER
--
-- Quién puede fusionar lo sigue decidiendo la RLS: borrar el origen pide
-- `stock.eliminar_producto` y mover variantes pide poder escribirlas. Una
-- DEFINER acá sería una puerta de atrás a esos permisos, igual que en
-- `eliminar_productos`.
-- ============================================================================

-- ── La preview ──────────────────────────────────────────────────────────────
-- Read-only, y existe porque la fusión NO tiene rollback: separar "3 unidades"
-- de vuelta en 1 + 2 es una suposición, no un dato. Esta es la única
-- oportunidad de arrepentirse, así que tiene que decir números exactos y no
-- "se van a combinar los productos".
--
-- Calcula la identidad con la MISMA función que la fusión
-- (`atributos_comparables`), para que lo que promete sea lo que pasa.
create or replace function public.previsualizar_fusion_productos(
  p_origen uuid,
  p_destino uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_origen  public.productos;
  v_destino public.productos;
  v_mover int;
  v_sumar int;
begin
  select * into v_origen  from public.productos where id = p_origen;
  select * into v_destino from public.productos where id = p_destino;

  if v_origen.id is null or v_destino.id is null then
    -- Cero filas es también lo que devuelve la RLS para un producto de otro
    -- negocio: las dos cosas terminan igual y no hay nada que distinguir.
    return jsonb_build_object('ok', false, 'error', 'PRODUCTO_NO_ENCONTRADO');
  end if;

  if p_origen = p_destino then
    return jsonb_build_object('ok', false, 'error', 'MISMO_PRODUCTO');
  end if;

  select
    count(*) filter (where g.id is null),
    count(*) filter (where g.id is not null)
  into v_mover, v_sumar
  from public.producto_variantes o
  left join lateral (
    select d.id from public.producto_variantes d
    where d.producto_id = p_destino
      and public.atributos_comparables(d.atributos)
        = public.atributos_comparables(o.atributos)
    limit 1
  ) g on true
  where o.producto_id = p_origen;

  return jsonb_build_object(
    'ok', true,
    'origen_nombre', v_origen.nombre,
    'destino_nombre', v_destino.nombre,
    'variantes_a_mover', coalesce(v_mover, 0),
    'variantes_a_sumar', coalesce(v_sumar, 0),
    'variantes_finales',
      (select count(*) from public.producto_variantes where producto_id = p_destino)
      + coalesce(v_mover, 0),
    'unidades_finales',
      coalesce((select sum(stock) from public.producto_variantes
                where producto_id in (p_origen, p_destino)), 0),
    'ventas_a_reapuntar',
      (select count(*) from public.ventas_items where producto_id = p_origen),
    'lineas_remito_a_reapuntar',
      (select count(*) from public.ordenes_items where producto_id = p_origen),
    'alias_a_reapuntar',
      (select count(*) from public.diccionario_alias where producto_id = p_origen),
    -- Lo que se DESCARTA del origen. Va en la preview porque es lo único que
    -- no se puede recuperar y lo que más sorprende después: la foto.
    'origen_tiene_foto', v_origen.imagen_url is not null,
    'destino_tiene_foto', v_destino.imagen_url is not null,
    'origen_precio', v_origen.precio,
    'destino_precio', v_destino.precio,
    -- Coincidir en los tres es la definición de duplicado que usa el aviso del
    -- alta. Cuando NO coinciden, fusionar puede ser el error al revés (juntar
    -- la remera de hombre con la de mujer), así que la pantalla tiene que
    -- volver a preguntar.
    'misma_categoria', v_origen.categoria_id is not distinct from v_destino.categoria_id,
    'misma_marca',
      upper(trim(coalesce(v_origen.marca, ''))) = upper(trim(coalesce(v_destino.marca, '')))
  );
end;
$$;

comment on function public.previsualizar_fusion_productos(uuid, uuid) is
  'Qué pasaría al fusionar dos productos, sin escribir nada. Usa la misma identidad de variante que la fusión real. Ver 20260910180000.';

-- ── La fusión ───────────────────────────────────────────────────────────────
create or replace function public.fusionar_productos(
  p_origen uuid,
  p_destino uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_negocio_origen  uuid;
  v_negocio_destino uuid;
  v_movidas int := 0;
  v_sumadas int := 0;
  v_ventas  int := 0;
  v_borrado int;
  v_unidades_antes numeric;
  v_unidades_despues numeric;
  r record;
  v_gemela uuid;
begin
  if p_origen = p_destino then
    raise exception 'MISMO_PRODUCTO';
  end if;

  -- Row lock sobre los dos, y en orden de id para que dos fusiones simultáneas
  -- que se cruzan no se abracen en un deadlock.
  perform 1 from public.productos
   where id in (p_origen, p_destino)
   order by id
     for update;

  select negocio_id into v_negocio_origen  from public.productos where id = p_origen;
  select negocio_id into v_negocio_destino from public.productos where id = p_destino;

  if v_negocio_origen is null or v_negocio_destino is null then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;

  -- Defensa en profundidad: la RLS ya impide ver un producto de otro negocio,
  -- pero fusionar cruzando negocios sería mover mercadería de un comercio a
  -- otro y eso no puede depender de una sola línea de defensa.
  if v_negocio_origen <> v_negocio_destino then
    raise exception 'NEGOCIOS_DISTINTOS';
  end if;

  select coalesce(sum(stock), 0) into v_unidades_antes
  from public.producto_variantes where producto_id in (p_origen, p_destino);

  -- El nivel de stock de la variante que recibe cambia de verdad, así que el
  -- trigger va a escribir. EDICION_VARIANTES y no un origen propio: no entró
  -- ni salió mercadería del local, cambió el catálogo. El +N de la que queda
  -- contra el -N de la que se borra cuentan la historia completa.
  perform set_config('comerz.origen_movimiento', 'EDICION_VARIANTES', true);

  for r in
    select pv.id, pv.stock, pv.nombre_display,
           public.atributos_comparables(pv.atributos) as identidad
    from public.producto_variantes pv
    where pv.producto_id = p_origen
  loop
    select d.id into v_gemela
    from public.producto_variantes d
    where d.producto_id = p_destino
      and public.atributos_comparables(d.atributos) = r.identidad
    limit 1;

    if v_gemela is null then
      -- Se mueve conservando su id, y con él su historia y los renglones de
      -- venta que la nombran.
      update public.producto_variantes set producto_id = p_destino where id = r.id;
      v_movidas := v_movidas + 1;
    else
      -- ANTES de borrar: los renglones de venta que apuntan a la que se va
      -- pasan a la que queda. Sin FK, el DELETE no avisaría.
      update public.ventas_items
         set variante_id = v_gemela
       where variante_id = r.id;

      insert into public.variantes_fusionadas (
        negocio_id, producto_id, clave,
        variante_id_eliminada, variante_id_sobrevive,
        fila_eliminada, stock_antes_sobrevive, stock_despues
      )
      select v_negocio_origen, p_destino, r.identidad,
             r.id, v_gemela,
             to_jsonb(pv), pv.stock, pv.stock + coalesce(r.stock, 0)
      from public.producto_variantes pv where pv.id = v_gemela;

      update public.producto_variantes
         set stock = stock + coalesce(r.stock, 0)
       where id = v_gemela;

      delete from public.producto_variantes where id = r.id;
      v_sumadas := v_sumadas + 1;
    end if;
  end loop;

  -- ── Todo lo que tiene que sobrevivir al borrado ──────────────────────────
  update public.ventas_items set producto_id = p_destino where producto_id = p_origen;
  get diagnostics v_ventas = row_count;

  update public.ordenes_items set producto_id = p_destino where producto_id = p_origen;
  update public.actualizaciones_precio_items set producto_id = p_destino where producto_id = p_origen;
  update public.producto_variantes_auditoria set producto_id = p_destino where producto_id = p_origen;
  update public.reservas set producto_id = p_destino where producto_id = p_origen;
  update public.bajas set producto_id = p_destino where producto_id = p_origen;
  update public.producto_precios set producto_id = p_destino where producto_id = p_origen;

  -- El alias del proveedor es lo que evita la RECAÍDA: sin esto, el próximo
  -- remito con el mismo nombre vuelve a crear el duplicado que se acaba de
  -- fusionar. Con `on conflict do nothing` porque el destino puede tener ya el
  -- alias de ese proveedor, y el unique es (negocio, proveedor, raw_nombre).
  insert into public.diccionario_alias (proveedor, raw_nombre, producto_id, negocio_id)
  select da.proveedor, da.raw_nombre, p_destino, da.negocio_id
  from public.diccionario_alias da
  where da.producto_id = p_origen
  on conflict (negocio_id, proveedor, raw_nombre) do nothing;

  delete from public.diccionario_alias where producto_id = p_origen;

  -- Promociones: solo las que el destino no tiene ya, o quedarían dos filas
  -- del mismo producto en la misma promo.
  update public.promociones_productos pp
     set producto_id = p_destino
   where pp.producto_id = p_origen
     and not exists (
       select 1 from public.promociones_productos otra
       where otra.promocion_id = pp.promocion_id and otra.producto_id = p_destino
     );
  delete from public.promociones_productos where producto_id = p_origen;

  -- ── El espejo legacy ─────────────────────────────────────────────────────
  -- Se recalcula desde la fuente canónica en vez de moverlo fila por fila: con
  -- una variante sumada, mover su fila dejaría dos filas espejo con el mismo
  -- (producto, variante), y ese par es único.
  delete from public.productos_stock where producto_id = p_origen;

  update public.productos_stock ps
     set cantidad = pv.stock
    from public.producto_variantes pv
   where pv.producto_id = p_destino
     and ps.producto_id = p_destino
     and ps.variante = pv.nombre_display;

  insert into public.productos_stock (producto_id, variante, cantidad, negocio_id)
  select p_destino, pv.nombre_display, pv.stock, v_negocio_destino
  from public.producto_variantes pv
  where pv.producto_id = p_destino
    and not exists (
      select 1 from public.productos_stock ps
      where ps.producto_id = p_destino and ps.variante = pv.nombre_display
    );

  -- ── El duplicado se va ───────────────────────────────────────────────────
  delete from public.productos where id = p_origen;
  get diagnostics v_borrado = row_count;

  -- Un DELETE filtrado por RLS vuelve con 0 filas y sin error: sin este
  -- chequeo, "no tenías permiso" se vería igual que "listo". Es el éxito
  -- silencioso que costó 35 fotos el 5/9.
  if v_borrado = 0 then
    raise exception 'SIN_PERMISO_PARA_BORRAR';
  end if;

  select coalesce(sum(stock), 0) into v_unidades_despues
  from public.producto_variantes where producto_id = p_destino;

  -- Una fusión no puede crear ni perder mercadería.
  if v_unidades_despues <> v_unidades_antes then
    raise exception 'UNIDADES_NO_CIERRAN: antes % despues %',
      v_unidades_antes, v_unidades_despues;
  end if;

  return jsonb_build_object(
    'ok', true,
    'variantes_movidas', v_movidas,
    'variantes_sumadas', v_sumadas,
    'ventas_reapuntadas', v_ventas,
    'unidades', v_unidades_despues,
    'variantes_finales',
      (select count(*) from public.producto_variantes where producto_id = p_destino)
  );
end;
$$;

comment on function public.fusionar_productos(uuid, uuid) is
  'Funde el producto origen dentro del destino y lo borra: mueve variantes, SUMA las que coinciden por atributos_comparables, y reapunta ventas, remitos, alias, promos, reservas y auditoría antes del borrado. SECURITY INVOKER: el permiso lo decide la RLS. Irreversible. Ver 20260910180000.';

revoke all on function public.previsualizar_fusion_productos(uuid, uuid) from public, anon;
revoke all on function public.fusionar_productos(uuid, uuid) from public, anon;
grant execute on function public.previsualizar_fusion_productos(uuid, uuid) to authenticated;
grant execute on function public.fusionar_productos(uuid, uuid) to authenticated;

do $$
declare
  v_cuerpo text := pg_get_functiondef('public.fusionar_productos(uuid,uuid)'::regprocedure);
  t text;
begin
  if has_function_privilege('anon', 'public.fusionar_productos(uuid,uuid)', 'execute') then
    raise exception 'GUARD: anon puede fusionar productos';
  end if;

  -- Cada tabla que apunta a productos y tiene que sobrevivir al borrado. Si
  -- mañana aparece una tabla hija nueva y no se agrega acá, su historial se
  -- va en silencio con el CASCADE — que es exactamente el modo de falla que
  -- esta función existe para evitar.
  foreach t in array array[
    'ventas_items', 'ordenes_items', 'actualizaciones_precio_items',
    'producto_variantes_auditoria', 'reservas', 'bajas', 'producto_precios',
    'diccionario_alias', 'promociones_productos'
  ] loop
    if position(t in v_cuerpo) = 0 then
      raise exception 'GUARD: fusionar_productos no reapunta %, su historial se perderia', t;
    end if;
  end loop;

  if position('atributos_comparables' in v_cuerpo) = 0 then
    raise exception 'GUARD: la fusion dejo de emparejar variantes por atributos_comparables';
  end if;
end $$;
