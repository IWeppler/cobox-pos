-- ============================================================================
-- TRES PRODUCTOS DEL PROVEEDOR QUE ENTRARON COMO UNO
-- ============================================================================
--
-- Auditado el 10/9/2026 a pedido de Evelyn, buscando "Short FER".
--
-- QUÉ PASÓ: en el remito `INGRESO` del 31/8 (aprobado 31/8 22:12), cuatro
-- líneas quedaron vinculadas al producto equivocado:
--
--   SHORT FER DEPORTIVO  Talle 2  AZUL / GRIS TOPO   (costo 4.500, venta 9.000)
--   SHORT LEO DEPORTIVO  Talle 10 NEGRO
--                        Talle 12 GRIS TOPO          (costo 6.000, venta 12.000)
--
-- Las cuatro se impactaron sobre `SHORT JULIO DEPORTIVO`, que se había creado
-- el 27/8 desde el remito de VERANITO con 11 variantes, TODAS 3XL y 4XL.
--
-- No hubo borrado ni renombre: "Short FER" nunca existió como producto. Es un
-- nombre de remito que la conciliación mandó adentro de otro producto, y se
-- entiende por qué — los tres nombres tienen la misma forma
-- (`SHORT ___ DEPORTIVO`) y el trigrama los da como candidatos entre sí. Es el
-- caso exacto que `hayEmpate` (afinidad-nombre.ts) existe para frenar.
--
-- POR QUÉ SE ARREGLA Y NO SE DEJA: el daño no es de precio —FER hereda los
-- $9.000 que el remito sugería y LEO tiene sus $12.000 propios— sino de
-- IDENTIDAD. El catálogo afirma que un short de hombre 4XL y uno de nene talle
-- 2 son el mismo artículo: la clienta ve un producto con talles 2, 10, 12, 3XL
-- y 4XL, /stock muestra un rango de precios, y las 4 unidades que están en el
-- local no se pueden buscar por su nombre.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTE SPLIT ES SEGURO Y OTRO PUEDE NO SERLO
--
-- Ninguna de las 4 variantes se vendió (las 2 ventas del producto son 3XL, de
-- JULIO). Eso saca del medio la parte peligrosa: `ventas_items.variante_id` no
-- tiene FK, así que un renglón vendido apuntando a una variante que se mueve o
-- se borra deja la anulación colgada del match por nombre. Acá no hay ninguno,
-- y el guard de abajo lo verifica en vez de confiar en la auditoría.
--
-- Las variantes se MUEVEN (update de `producto_id`), no se borran y recrean:
-- así conservan su id, y con él su historia en `movimientos_stock` y cualquier
-- referencia futura.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ NO SE TOCA
--
-- `movimientos_stock` queda como está, con esas entradas registradas contra
-- JULIO. Es append-only por RLS y es la verdad de lo que pasó: la mercadería
-- entró ahí. Reescribirlo sería falsificar el historial para que coincida con
-- la corrección.
--
-- El stock NO cambia: es la misma mercadería, en otro producto. Por eso el
-- trigger no escribe una sola fila (solo registra cuando cambia `stock`), y
-- por eso el guard compara las unidades antes y después.
--
-- La CATEGORÍA de los dos productos nuevos se copia de JULIO. Talle 2, 10 y 12
-- son de nene y probablemente correspondan a otra rama del árbol, pero eso lo
-- decide el comercio mirando su catálogo, no una migración.
-- ============================================================================

do $$
declare
  v_negocio   uuid := '44468525-8381-4c83-a558-eb7209e386b5'; -- Evens
  v_julio     uuid := 'fb64931d-db1b-469e-96d7-39a46c78ca24';
  v_fer       uuid;
  v_leo       uuid;
  v_vendidas  int;
  v_unidades_antes  numeric;
  v_unidades_despues numeric;
  v_variantes_fer   int;
  v_variantes_leo   int;
  v_variantes_julio int;

  -- Las variantes, por id: mover por nombre sería repetir el error que trajo
  -- todo esto. `ventas_items.variante_id` (20260816130000) existe justamente
  -- porque el nombre no identifica.
  v_ids_fer uuid[] := array[
    'fad4a7cb-e1c8-4845-a453-0621cb439575',  -- Talle: 2 / Color: AZUL
    '03e84c24-6722-4740-afea-d60bcd638c85'   -- Talle: 2 / Color: GRIS TOPO
  ]::uuid[];
  v_ids_leo uuid[] := array[
    'c8706d92-85c4-44a5-aa32-b637ac4e57ab',  -- Talle: 10 / Color: NEGRO
    'fc578a1b-97e8-42bb-8323-f430edb2f226'   -- Talle: 12 / Color: GRIS TOPO
  ]::uuid[];
begin
  -- ── Guard 1: nadie vendió estas variantes ────────────────────────────────
  select count(*) into v_vendidas
  from public.ventas_items vi
  where vi.variante_id = any(v_ids_fer || v_ids_leo);

  if v_vendidas > 0 then
    raise exception
      'ABORTA: % renglones de venta apuntan a estas variantes. Reapuntar ventas_items ANTES de moverlas.',
      v_vendidas;
  end if;

  -- ── Guard 2: la situación es la que se auditó ────────────────────────────
  if not exists (
    select 1 from public.productos
    where id = v_julio and negocio_id = v_negocio
      and nombre = 'SHORT JULIO DEPORTIVO'
  ) then
    -- Si el producto ya no existe o cambió de nombre, esta migración está
    -- describiendo otra base. Mejor fallar que mover variantes a ciegas.
    raise notice 'SHORT JULIO DEPORTIVO no está como se auditó: no se hace nada.';
    return;
  end if;

  if (select count(*) from public.producto_variantes
      where id = any(v_ids_fer || v_ids_leo) and producto_id = v_julio) <> 4 then
    raise notice 'Las 4 variantes ya no cuelgan de JULIO: la separación ya se hizo.';
    return;
  end if;

  select coalesce(sum(stock), 0) into v_unidades_antes
  from public.producto_variantes where producto_id = v_julio;

  -- ── Los dos productos nuevos ─────────────────────────────────────────────
  -- El precio de cabecera es el que el REMITO traía para cada uno, no el de
  -- JULIO: son los números que el proveedor puso y los que la dueña esperaba
  -- ver.
  insert into public.productos
    (nombre, tipo, precio, precio_costo, categoria_id, tratamiento_iva,
     unidad_medida, publicado, slug, negocio_id)
  select 'SHORT FER DEPORTIVO', p.tipo, 9000, 4500, p.categoria_id,
         p.tratamiento_iva, p.unidad_medida, p.publicado,
         'short-fer-deportivo-fb64', v_negocio
  from public.productos p where p.id = v_julio
  returning id into v_fer;

  insert into public.productos
    (nombre, tipo, precio, precio_costo, categoria_id, tratamiento_iva,
     unidad_medida, publicado, slug, negocio_id)
  select 'SHORT LEO DEPORTIVO', p.tipo, 12000, 6000, p.categoria_id,
         p.tratamiento_iva, p.unidad_medida, p.publicado,
         'short-leo-deportivo-fb64', v_negocio
  from public.productos p where p.id = v_julio
  returning id into v_leo;

  -- ── Mover las variantes ──────────────────────────────────────────────────
  -- El origen se declara aunque no debería escribirse ningún movimiento (el
  -- trigger solo registra cuando cambia `stock`, y acá no cambia). Está puesto
  -- para que, si algo lo moviera, quede etiquetado y no como DESCONOCIDO.
  perform set_config('comerz.origen_movimiento', 'EDICION_VARIANTES', true);

  update public.producto_variantes
     set producto_id = v_fer,
         -- Vuelven a HEREDAR: su precio propio era una copia del efectivo, y
         -- una copia se desincroniza en el próximo cambio de precio. null es
         -- un valor con significado ("seguime al producto").
         precio = null,
         costo  = null
   where id = any(v_ids_fer);

  update public.producto_variantes
     set producto_id = v_leo,
         -- Las de LEO tenían $12.000 / $6.000 propios, que ahora son
         -- exactamente el precio y el costo de su cabecera: heredan.
         precio = null,
         costo  = null
   where id = any(v_ids_leo);

  -- ── El espejo legacy ─────────────────────────────────────────────────────
  -- `productos_stock` se busca por (producto_id, variante). Si no se mueve,
  -- la venta de un talle 2 no encuentra su fila espejo y se cae con "Error de
  -- stock en ...", que es el incidente del 5/9.
  update public.productos_stock ps
     set producto_id = v_fer
   where ps.producto_id = v_julio
     and ps.variante in ('Talle: 2 / Color: AZUL', 'Talle: 2 / Color: GRIS TOPO');

  update public.productos_stock ps
     set producto_id = v_leo
   where ps.producto_id = v_julio
     and ps.variante in ('Talle: 10 / Color: NEGRO', 'Talle: 12 / Color: GRIS TOPO');

  -- ── La trazabilidad del remito ───────────────────────────────────────────
  -- Sin esto, las líneas del remito seguirían diciendo que "SHORT FER
  -- DEPORTIVO" entró a JULIO, que es justo la afirmación que se está
  -- corrigiendo. `variante_match` no se toca: el texto que trajo el remito es
  -- el que trajo.
  update public.ordenes_items oi
     set producto_id = v_fer
   where oi.negocio_id = v_negocio
     and oi.producto_id = v_julio
     and oi.raw_nombre = 'SHORT FER DEPORTIVO';

  update public.ordenes_items oi
     set producto_id = v_leo
   where oi.negocio_id = v_negocio
     and oi.producto_id = v_julio
     and oi.raw_nombre = 'SHORT LEO DEPORTIVO';

  -- ── Guards de salida ─────────────────────────────────────────────────────
  select count(*) into v_variantes_fer   from public.producto_variantes where producto_id = v_fer;
  select count(*) into v_variantes_leo   from public.producto_variantes where producto_id = v_leo;
  select count(*) into v_variantes_julio from public.producto_variantes where producto_id = v_julio;

  select coalesce(sum(stock), 0) into v_unidades_despues
  from public.producto_variantes
  where producto_id in (v_julio, v_fer, v_leo);

  if v_variantes_fer <> 2 or v_variantes_leo <> 2 or v_variantes_julio <> 11 then
    raise exception 'GUARD: quedaron FER=%, LEO=%, JULIO=% (esperado 2, 2, 11)',
      v_variantes_fer, v_variantes_leo, v_variantes_julio;
  end if;

  -- Una separación no puede crear ni perder mercadería. Es la misma prueba que
  -- usó la normalización de precios: guardar el número antes y verificarlo
  -- después, en vez de prometer que no cambió.
  if v_unidades_despues <> v_unidades_antes then
    raise exception 'GUARD: las unidades cambiaron de % a %',
      v_unidades_antes, v_unidades_despues;
  end if;

  -- El precio efectivo de cada variante movida tiene que seguir siendo el
  -- mismo: heredar de la cabecera nueva da el número que ya cobraba.
  if exists (
    select 1 from public.producto_variantes pv
    join public.productos p on p.id = pv.producto_id
    where pv.id = any(v_ids_leo)
      and coalesce(pv.precio, p.precio) <> 12000
  ) then
    raise exception 'GUARD: alguna variante de LEO dejó de valer 12000';
  end if;

  if exists (
    select 1 from public.producto_variantes pv
    join public.productos p on p.id = pv.producto_id
    where pv.id = any(v_ids_fer)
      and coalesce(pv.precio, p.precio) <> 9000
  ) then
    raise exception 'GUARD: alguna variante de FER dejó de valer 9000';
  end if;

  raise notice 'Separado: FER=% LEO=% (JULIO queda con % variantes)',
    v_fer, v_leo, v_variantes_julio;
end $$;
