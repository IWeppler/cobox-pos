-- ---------------------------------------------------------------------------
-- REVERTE PARCIAL de `20260905123115_rls_por_rol_en_config_y_catalogo`.
--
-- QUÉ PASÓ. Esa migración exigió `stock.editar_producto` (ADMIN + ENCARGADO)
-- para escribir `productos`. Al proponerla dije que el impacto para las
-- vendedoras era ninguno, porque verifiqué que `/stock` y
-- `/stock/fotos-pendientes` ya gateaban por admin en la UI. Me faltó seguir un
-- camino: el sheet de edición de producto SÍ es alcanzable por una vendedora, y
-- su botón de foto llama `actualizarFotosProductoAction`, que hace
-- `UPDATE productos` con las cuatro columnas de imagen.
--
-- CONSECUENCIA MEDIDA. Mara (VENDEDOR de Evens) estuvo cargando fotos entre las
-- 12:52 y las 13:38 UTC del 5/9, o sea desde 21 minutos después de aplicar la
-- migración (12:31:15). De los 113 archivos que subió Storage ese día, 104
-- quedaron HUÉRFANOS (92%; los días previos el ruido normal era 12-16%). Las
-- fotos de Evelyn (ADMIN) sí se guardaron, incluida una a las 14:22.
--
-- POR QUÉ EN SILENCIO. `actualizar-fotos-producto.ts` hace
-- `.update(...).eq(...)` sin `.select()` ni chequeo de filas afectadas. Con la
-- fila filtrada por RLS, PostgREST devuelve 0 filas y `error: null`: la action
-- retorna `{success:true}` y la pantalla dice "Foto guardada". Por eso no había
-- un solo error en Vercel.
--
-- QUÉ SE REVIERTE Y QUÉ NO. Vuelve el estado de ayer para UPDATE e INSERT de
-- `productos` — que es lo que destraba a la vendedora, incluida la carga de
-- fotos y la creación de producto que también hace (2 en los últimos 30 días).
-- NO se revierte:
--   * DELETE de `productos`: sigue pidiendo `stock.eliminar_producto` (ADMIN).
--     Está gateado por admin en la UI y ninguna vendedora borró un producto.
--   * `configuracion_pos`, `metodos_pago`, `promociones`, `categorias`: siguen
--     restringidas. Ningún camino de vendedora las tocaba.
--
-- ESTO ES UN PASO ATRÁS A PROPÓSITO, no un olvido: reabre que una vendedora
-- pueda cambiar precios por PostgREST. Se acepta porque es el estado en que el
-- sistema venía funcionando y porque dejar a una empleada sin poder trabajar
-- —creyendo además que guardó— es peor que el riesgo que se vuelve a correr por
-- unos días.
--
-- EL ARREGLO DEFINITIVO, que este archivo NO hace: mover la escritura de fotos
-- a una función SECURITY DEFINER (`actualizar_fotos_producto`) que valide un
-- permiso propio y escriba SOLO las cuatro columnas de imagen, y recién ahí
-- volver a cerrar el UPDATE de `productos`. La RLS es por fila y no puede
-- distinguir "puede tocar la foto pero no el precio"; una función sí. Es el
-- mismo patrón que quedó pendiente para `producto_variantes` y el UPDATE de
-- `promociones`.
-- ---------------------------------------------------------------------------
drop policy if exists productos_update_con_permiso on public.productos;
drop policy if exists productos_insert_con_permiso on public.productos;

create policy productos_update_auth on public.productos
  for update to authenticated
  using (true) with check (true);

create policy productos_insert_auth on public.productos
  for insert to authenticated
  with check (true);

comment on policy productos_update_auth on public.productos is
  'Provisorio. Volvió a abrirse el 5/9/2026 porque exigir stock.editar_producto dejó a las vendedoras sin poder cargar fotos, y en silencio. Se vuelve a cerrar cuando la foto tenga su propia RPC SECURITY DEFINER.';

-- Guard: el DELETE tiene que seguir pidiendo permiso.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='productos' and cmd='DELETE'
       and coalesce(qual,'') like '%stock.eliminar_producto%') then
    raise exception 'Se perdió la restricción de DELETE sobre productos.';
  end if;
end $$;
