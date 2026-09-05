-- ---------------------------------------------------------------------------
-- La RLS deja de mirar solo el negocio y empieza a mirar el ROL.
--
-- EL AGUJERO. El aislamiento entre negocios era sólido —`current_negocio_id()`
-- valida la cookie contra `usuarios_negocios` y nadie ve datos de otro
-- comercio— pero adentro del negocio las policies de configuración y catálogo
-- decían literalmente `true` o `auth.role() = 'authenticated'`. O sea que
-- cualquier miembro del comercio, con el rol que fuera, podía escribirlas.
--
-- Medido sobre Evens, simulando la sesión de una VENDEDORA: pudo tocar
-- `configuracion_pos` (1 fila, incluye el `cc_recargo_default` del 15% y el
-- modo de facturación), `metodos_pago` (4 filas, incluye `comision` y
-- `recargo_porcentaje`), `productos` (1.253 filas, todos los precios) y
-- `promociones` (3 filas). Y no hace falta pasar por un server action: el
-- navegador ya tiene supabase-js con su sesión, así que alcanza con la consola.
--
-- EL CORTE NO SE INVENTA ACÁ. Ya estaba declarado en `permisos` / `rol_permisos`
-- desde `20260717001048`: `stock.editar_producto` es de ADMIN y ENCARGADO,
-- `stock.eliminar_producto` solo de ADMIN, `stock.cambiar_categoria` de ADMIN y
-- ENCARGADO. Lo único que faltaba era que la base lo hiciera cumplir en vez de
-- confiar en que la UI escondiera el botón. Un server action es un endpoint, y
-- PostgREST es otro.
--
-- CÓMO SE ESCRIBE EL PREDICADO, que importa tanto como qué dice: va
-- `(select public.tiene_permiso('...'))` con el subselect, NUNCA
-- `public.tiene_permiso('...')` suelto. Es la misma lección de
-- `20260816100000`: sin el subselect la función se evalúa UNA VEZ POR FILA, y
-- un update masivo de precios pasaría de una llamada a 1.253.
--
-- LO QUE ESTA MIGRACIÓN NO PUEDE CERRAR, y por qué no es olvido:
--
--   * `producto_variantes` y `productos_stock`. La venta descuenta stock con
--     `ajustar_stock_variante` y `registrar_venta`, que son SECURITY INVOKER a
--     propósito (el aislamiento tiene que seguir siendo la RLS del que llama).
--     O sea que la vendedora NECESITA poder escribir esas tablas para vender.
--     La RLS es por FILA, no por columna, así que no hay forma de decir "puede
--     tocar `stock` pero no `precio`" con una policy. Cerrarlas dejaría al
--     mostrador sin poder vender, que es peor que el agujero.
--   * `promociones` UPDATE. `registrar_venta` incrementa `usos_actuales` en
--     cada venta con promo, con la RLS de la vendedora. Mismo problema de
--     columna. Sí se cierran INSERT y DELETE, que no los usa la venta.
--
--   La salida para los tres es la misma y es un cambio aparte: mover esa
--   escritura angosta a una función SECURITY DEFINER que valide el negocio por
--   su cuenta, y recién entonces cerrar la tabla. Toca el camino de la venta,
--   así que va sola y con su propio smoke test.
--
-- SELECT NO SE TOCA EN NINGUNA TABLA. Esto restringe escritura y nada más.
-- Donde se dropea una policy `FOR ALL` que también daba lectura, se agrega la
-- de SELECT explícita en su lugar.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- configuracion_pos — el recargo de cuenta corriente, el modo de facturación,
-- el punto de venta y el rubro. Solo ADMIN.
-- No hay policy de INSERT ni de DELETE, y se dejan como están: la fila la crea
-- `crear_negocio_con_owner`, que es SECURITY DEFINER y no pasa por RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "Edicion configuracion solo auth" on public.configuracion_pos;

create policy configuracion_pos_update_admin on public.configuracion_pos
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- metodos_pago — `comision` (lo que el comercio le paga al procesador) y
-- `recargo_porcentaje` (lo que le cobra al cliente). Solo ADMIN.
-- La lectura queda como estaba: el POS necesita los métodos para cobrar.
-- ---------------------------------------------------------------------------
drop policy if exists "Permitir modificaciones a usuarios autenticados" on public.metodos_pago;

create policy metodos_pago_insert_admin on public.metodos_pago
  for insert to authenticated with check ((select public.is_admin()));

create policy metodos_pago_update_admin on public.metodos_pago
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy metodos_pago_delete_admin on public.metodos_pago
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- productos — precios e identidad del catálogo.
-- INSERT y UPDATE con `stock.editar_producto` (ADMIN + ENCARGADO): es el mismo
-- permiso que ya pide la edición desde el panel, y el que tienen los dos roles
-- que pueden ingresar un remito — `aprobar_orden_compra_impl` actualiza
-- precios, así que sin esto la aprobación de remitos se rompería.
-- DELETE con `stock.eliminar_producto` (solo ADMIN).
-- ---------------------------------------------------------------------------
drop policy if exists "Edición productos solo auth" on public.productos;
drop policy if exists "Permitir insertar productos a autenticados" on public.productos;

-- La policy `FOR ALL` que se dropeó también daba la lectura: se repone.
create policy productos_select_auth on public.productos
  for select to authenticated using (true);

create policy productos_insert_con_permiso on public.productos
  for insert to authenticated
  with check ((select public.tiene_permiso('stock.editar_producto')));

create policy productos_update_con_permiso on public.productos
  for update to authenticated
  using ((select public.tiene_permiso('stock.editar_producto')))
  with check ((select public.tiene_permiso('stock.editar_producto')));

create policy productos_delete_con_permiso on public.productos
  for delete to authenticated
  using ((select public.tiene_permiso('stock.eliminar_producto')));

-- ---------------------------------------------------------------------------
-- categorias — `stock.cambiar_categoria` (ADMIN + ENCARGADO). Son los mismos
-- roles que ingresan remitos, y hace falta: `crear_productos_desde_remito`
-- crea la categoría propuesta cuando la persona la deja puesta.
-- ---------------------------------------------------------------------------
drop policy if exists "Gestion total de categorias a usuarios autenticados" on public.categorias;
drop policy if exists "Permitir todo a usuarios autenticados en categorias" on public.categorias;

create policy categorias_select_auth on public.categorias
  for select to authenticated using (true);

create policy categorias_insert_con_permiso on public.categorias
  for insert to authenticated
  with check ((select public.tiene_permiso('stock.cambiar_categoria')));

create policy categorias_update_con_permiso on public.categorias
  for update to authenticated
  using ((select public.tiene_permiso('stock.cambiar_categoria')))
  with check ((select public.tiene_permiso('stock.cambiar_categoria')));

create policy categorias_delete_con_permiso on public.categorias
  for delete to authenticated
  using ((select public.tiene_permiso('stock.cambiar_categoria')));

-- ---------------------------------------------------------------------------
-- promociones — INSERT y DELETE solo ADMIN. El UPDATE queda abierto a
-- propósito y está explicado en el encabezado: `registrar_venta` incrementa
-- `usos_actuales` con la RLS de quien vende.
--
-- OJO, hallazgo aparte: hoy no existe NINGUNA policy de DELETE en esta tabla,
-- así que borrar una promoción viene fallando en silencio desde siempre
-- (`eliminarPromocionAction` no puede tocar ninguna fila). La policy de abajo
-- lo destraba para ADMIN, que es lo que la pantalla ya ofrece.
-- ---------------------------------------------------------------------------
drop policy if exists "Insert promociones" on public.promociones;

create policy promociones_insert_admin on public.promociones
  for insert to authenticated with check ((select public.is_admin()));

create policy promociones_delete_admin on public.promociones
  for delete to authenticated using ((select public.is_admin()));

-- Las tablas puente de promociones: las escribe el alta desde el panel, nunca
-- la venta. Los nombres viejos van uno por uno y no por un bucle que los
-- derive del nombre de la tabla: la de métodos se llama "Insert promociones_
-- metodos" (sin el "_pago"), así que un bucle la dejaría viva y la nueva
-- policy no serviría de nada — las permisivas se combinan con OR.
-- Las de SELECT existen aparte en las tres tablas y no se tocan.
drop policy if exists "Insert promociones_productos" on public.promociones_productos;
drop policy if exists "Delete promociones_productos" on public.promociones_productos;
drop policy if exists "Insert promociones_categorias" on public.promociones_categorias;
drop policy if exists "Insert promociones_metodos" on public.promociones_metodos_pago;

create policy promociones_productos_insert_admin on public.promociones_productos
  for insert to authenticated with check ((select public.is_admin()));
create policy promociones_productos_delete_admin on public.promociones_productos
  for delete to authenticated using ((select public.is_admin()));

create policy promociones_categorias_insert_admin on public.promociones_categorias
  for insert to authenticated with check ((select public.is_admin()));
create policy promociones_categorias_delete_admin on public.promociones_categorias
  for delete to authenticated using ((select public.is_admin()));

create policy promociones_metodos_pago_insert_admin on public.promociones_metodos_pago
  for insert to authenticated with check ((select public.is_admin()));
create policy promociones_metodos_pago_delete_admin on public.promociones_metodos_pago
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Guard: ninguna de las tablas cerradas puede quedar con una policy de
-- escritura cuyo predicado sea `true` a secas. Mismo criterio que el guard de
-- `20260816100000`: si el resultado no es el que dice el encabezado, la
-- migración falla en vez de dejar el agujero abierto y el archivo diciendo que
-- lo cerró.
-- ---------------------------------------------------------------------------
-- Ojo con cómo se lee `pg_policies`, que es donde este guard se equivocó la
-- primera vez y abortó una migración correcta: en una policy de INSERT la
-- columna `qual` es SIEMPRE null (no hay filas viejas que filtrar) y en una de
-- DELETE lo es `with_check`. Mirar las dos columnas con un `coalesce(..,
-- 'true')` marca como sospechosa a toda policy bien escrita. Hay que mirar la
-- que corresponde a cada comando.
do $$
declare v_malas int; v_detalle text;
begin
  select count(*), string_agg(tablename||'.'||policyname||' ('||cmd||')', ', ')
    into v_malas, v_detalle
    from pg_policies
   where schemaname = 'public'
     and tablename in ('configuracion_pos','metodos_pago','productos','categorias')
     and permissive = 'PERMISSIVE'
     and case cmd
           when 'INSERT' then btrim(coalesce(with_check, 'true')) = 'true'
           when 'DELETE' then btrim(coalesce(qual, 'true')) = 'true'
           when 'UPDATE' then btrim(coalesce(qual, 'true')) = 'true'
                            or btrim(coalesce(with_check, qual, 'true')) = 'true'
           when 'ALL'    then btrim(coalesce(qual, 'true')) = 'true'
                            or btrim(coalesce(with_check, qual, 'true')) = 'true'
           else false
         end;

  if v_malas > 0 then
    raise exception 'Quedaron % policies de escritura con predicado true: %', v_malas, v_detalle;
  end if;
end $$;
