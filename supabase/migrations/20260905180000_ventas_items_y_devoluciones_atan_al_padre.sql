-- ---------------------------------------------------------------------------
-- `ventas_items`, `devoluciones` y `devoluciones_items`: el INSERT deja de
-- aceptar filas colgadas de una venta ajena.
--
-- Es el mismo agujero que `20260905140000` cerró en `venta_pagos`, en las
-- otras tres hijas: la policy de INSERT era `with check (true)` y la
-- RESTRICTIVE `aislamiento_negocio` solo obliga a que `negocio_id` sea el
-- propio — nada ataba `venta_id` (ni `devolucion_id`) a algo del mismo
-- comercio. Un usuario de otro negocio podía dejar un renglón fantasma
-- colgando de una venta que no puede ni ver.
--
-- POR QUÉ IMPORTABA, con el caso concreto ya medido: `registrar_devolucion`
-- suma `ventas_items` para calcular `v_base_total`, que es el denominador del
-- prorrateo del recargo de cuenta corriente y la base del flag
-- `venta_totalmente_devuelta`. `20260905160000` le puso el filtro de
-- `negocio_id` adentro; esto le saca la vía de entrada.
--
-- LO QUE SE VERIFICÓ ANTES DE APLICAR — y esta vez sí, siguiendo el CÓDIGO y
-- no lo que la UI parece esconder, que es la lección que costó las 35 fotos de
-- Mara el mismo día:
--   * Quién inserta cada tabla: `registrar_venta` (SECURITY INVOKER, o sea que
--     la RLS de la vendedora SÍ aplica) escribe `ventas_items`;
--     `registrar_devolucion` (SECURITY DEFINER, la esquiva) escribe
--     `devoluciones` y `devoluciones_items`. Ningún server action las escribe
--     directo — solo leen.
--   * Simulando la sesión REAL de una VENDEDORA de Evens, en transacción
--     revertida y con estas policies ya puestas:
--       - insertar cabecera de venta + renglón: 1 y 1 fila. Vender sigue
--         funcionando.
--       - renglón contra una venta de otro negocio: BLOQUEADO (42501).
--       - `registrar_devolucion` completa sobre una venta real: OK, método
--         EFECTIVO, $2.250 devueltos.
--
-- El SELECT y el DELETE no se tocan. El DELETE de `ventas_items` queda como
-- estaba (`true` + la RESTRICTIVE de negocio): ahí no hay agujero de tenancy
-- porque la restrictiva ya limita a las filas propias.
-- ---------------------------------------------------------------------------
drop policy if exists "Permitir insertar items" on public.ventas_items;
create policy ventas_items_insert_de_venta_propia on public.ventas_items
  for insert to authenticated
  with check (exists (select 1 from public.ventas v where v.id = venta_id));

drop policy if exists devoluciones_insert on public.devoluciones;
create policy devoluciones_insert_de_venta_propia on public.devoluciones
  for insert to authenticated
  with check (exists (select 1 from public.ventas v where v.id = venta_id));

drop policy if exists devoluciones_items_insert on public.devoluciones_items;
create policy devoluciones_items_insert_de_devolucion_propia on public.devoluciones_items
  for insert to authenticated
  with check (exists (select 1 from public.devoluciones d where d.id = devolucion_id));

-- Guard: ninguna de las tres puede quedar con un INSERT abierto.
do $$
declare v_malas int; v_detalle text;
begin
  select count(*), string_agg(tablename||'.'||policyname, ', ')
    into v_malas, v_detalle
    from pg_policies
   where schemaname='public'
     and tablename in ('ventas_items','devoluciones','devoluciones_items')
     and cmd='INSERT' and permissive='PERMISSIVE'
     and btrim(coalesce(with_check,'true'))='true';
  if v_malas > 0 then
    raise exception 'Quedaron % policies de INSERT abiertas: %', v_malas, v_detalle;
  end if;
end $$;
