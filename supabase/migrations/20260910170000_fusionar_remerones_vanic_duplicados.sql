-- ============================================================================
-- DOS "REMERONES VANIC OVERSIZE" QUE SON EL MISMO PRODUCTO
-- ============================================================================
--
-- El remito del 10/9 creó un producto con el nombre EXACTAMENTE igual a uno
-- que ya existía desde el 11/8. No hubo typo ni renombre: la conciliación da
-- de alta un producto homónimo sin decir nada.
--
--   destino  6da851ce  11/8  16 variantes  11 unidades  10 renglones vendidos
--   origen   f519d773  10/9   4 variantes   5 unidades   0 renglones vendidos
--
-- Sobrevive el VIEJO: tiene la historia de ventas, la foto y las 16 variantes.
-- Mover diez renglones de venta para conservar el producto nuevo sería el
-- riesgo grande de esta operación a cambio de nada.
--
-- ─────────────────────────────────────────────────────────────────────────
-- FUSIONAR NO ES MOVER: UNA VARIANTE SE SUMA
--
-- El origen trae L/ROSADO, M/NATURAL, XL/BEIGE y XL/ROSADO. El destino YA
-- tiene M/NATURAL con 1 unidad, así que ahí no se puede mover: hay que sumar
-- (1 + 2 = 3) y borrar la del origen. Las otras tres se mueven.
--
-- No es opcional: `idx_variante_identidad` es único por
-- (negocio, producto, atributos_comparables), así que mover la M/NATURAL del
-- origen encima de la del destino falla con 23505. La restricción de la base
-- es la que obliga a decidir, y decidir bien es sumar — es la misma prenda,
-- del mismo proveedor, en el mismo talle y color.
--
-- Ojo con la comparación: el destino guarda "TALLE: M / COLOR: NATURAL" y el
-- origen "Talle: M / Color: NATURAL". Por eso el emparejamiento va por
-- `atributos_comparables` y NO por `nombre_display` — es la misma regla que
-- ya costó una corrida abortada en la limpieza de Género.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL MOVIMIENTO DE STOCK CUENTA LA HISTORIA COMPLETA
--
-- El +2 sobre la variante que queda y el -2 de la que se borra se registran
-- los dos, con origen EDICION_VARIANTES. El neto es cero —no entró ni salió
-- mercadería— pero las dos filas juntas explican por qué una variante pasó de
-- 1 a 3 un martes sin que llegara un remito. Mismo criterio que el merge de
-- variantes duplicadas de `20260904170000`.
--
-- `ventas_items` no se reapunta porque el origen no tiene ninguno, y el guard
-- lo verifica en vez de confiar en eso. Si algún día lo tuviera, habría que
-- reapuntarlo ANTES del borrado: no hay FK, así que el DELETE no avisaría y el
-- renglón quedaría apuntando a la nada.
-- ============================================================================

do $$
declare
  v_negocio uuid := '44468525-8381-4c83-a558-eb7209e386b5';
  v_destino uuid := '6da851ce-f10e-463c-8620-16ce51d4216b';
  v_origen  uuid := 'f519d773-dcbd-41ac-8940-461d2fb382f0';
  v_vendidas int;
  v_unidades_antes numeric;
  v_unidades_despues numeric;
  v_variantes_final int;
  v_movidas int := 0;
  v_sumadas int := 0;
  r record;
  v_gemela uuid;
begin
  -- ── Guards de entrada ────────────────────────────────────────────────────
  if not exists (select 1 from public.productos where id = v_origen and negocio_id = v_negocio)
     or not exists (select 1 from public.productos where id = v_destino and negocio_id = v_negocio)
  then
    raise notice 'Alguno de los dos productos ya no existe: la fusion ya se hizo.';
    return;
  end if;

  select count(*) into v_vendidas from public.ventas_items where producto_id = v_origen;
  if v_vendidas > 0 then
    raise exception
      'ABORTA: el producto origen tiene % renglones de venta. Reapuntar ventas_items ANTES de fusionar.',
      v_vendidas;
  end if;

  select coalesce(sum(stock),0) into v_unidades_antes
  from public.producto_variantes where producto_id in (v_origen, v_destino);

  perform set_config('comerz.origen_movimiento', 'EDICION_VARIANTES', true);

  -- ── Variante por variante ────────────────────────────────────────────────
  for r in
    select pv.id, pv.stock, pv.nombre_display, public.atributos_comparables(pv.atributos) as identidad
    from public.producto_variantes pv
    where pv.producto_id = v_origen
  loop
    select pv.id into v_gemela
    from public.producto_variantes pv
    where pv.producto_id = v_destino
      and public.atributos_comparables(pv.atributos) = r.identidad;

    if v_gemela is null then
      -- No existe en el destino: se mueve tal cual, conservando su id (y con
      -- él su historia en movimientos_stock).
      update public.producto_variantes set producto_id = v_destino where id = r.id;
      v_movidas := v_movidas + 1;
    else
      -- Existe: el stock se suma en la que queda y la del origen se borra. El
      -- trigger registra las dos mitades.
      update public.producto_variantes
         set stock = stock + coalesce(r.stock, 0)
       where id = v_gemela;
      delete from public.producto_variantes where id = r.id;
      v_sumadas := v_sumadas + 1;
    end if;
  end loop;

  -- ── El espejo legacy ─────────────────────────────────────────────────────
  -- Se recalcula desde la fuente canónica en vez de moverlo fila por fila: con
  -- una variante sumada, mover la fila del origen dejaría dos filas espejo con
  -- el mismo (producto, variante) y la venta busca por ahí.
  delete from public.productos_stock where producto_id = v_origen;

  update public.productos_stock ps
     set cantidad = pv.stock
    from public.producto_variantes pv
   where pv.producto_id = v_destino
     and ps.producto_id = v_destino
     and ps.variante = pv.nombre_display;

  insert into public.productos_stock (producto_id, variante, cantidad, negocio_id)
  select v_destino, pv.nombre_display, pv.stock, v_negocio
  from public.producto_variantes pv
  where pv.producto_id = v_destino
    and not exists (
      select 1 from public.productos_stock ps
      where ps.producto_id = v_destino and ps.variante = pv.nombre_display
    );

  -- ── Trazabilidad del remito ──────────────────────────────────────────────
  update public.ordenes_items
     set producto_id = v_destino
   where producto_id = v_origen;

  -- ── El duplicado se va ───────────────────────────────────────────────────
  delete from public.productos where id = v_origen;

  -- ── Guards de salida ─────────────────────────────────────────────────────
  select count(*), coalesce(sum(stock),0)
    into v_variantes_final, v_unidades_despues
  from public.producto_variantes where producto_id = v_destino;

  if v_unidades_despues <> v_unidades_antes then
    raise exception 'GUARD: las unidades cambiaron de % a %',
      v_unidades_antes, v_unidades_despues;
  end if;

  if v_variantes_final <> 19 then
    raise exception 'GUARD: quedaron % variantes (esperado 19: 16 + 3 movidas)',
      v_variantes_final;
  end if;

  if v_movidas <> 3 or v_sumadas <> 1 then
    raise exception 'GUARD: movidas=% sumadas=% (esperado 3 y 1)', v_movidas, v_sumadas;
  end if;

  -- El espejo tiene que cerrar con la fuente canónica: si no, la venta de una
  -- variante no encuentra su fila y se cae en el mostrador.
  if exists (
    select 1 from public.producto_variantes pv
    left join public.productos_stock ps
      on ps.producto_id = pv.producto_id and ps.variante = pv.nombre_display
    where pv.producto_id = v_destino
      and (ps.id is null or ps.cantidad <> pv.stock)
  ) then
    raise exception 'GUARD: el espejo legacy no cierra con producto_variantes';
  end if;

  raise notice 'Fusionado: % movidas, % sumadas, % variantes, % unidades',
    v_movidas, v_sumadas, v_variantes_final, v_unidades_despues;
end $$;
