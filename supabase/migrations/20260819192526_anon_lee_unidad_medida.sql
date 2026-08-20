-- ---------------------------------------------------------------------------
-- `anon` puede leer productos.unidad_medida.
--
-- POR QUÉ HACE FALTA: la lista `COLUMNAS_PRODUCTO_PUBLICO`
-- (shared/lib/columnas-publicas.ts) la comparten el catálogo público y el POS,
-- y con GRANT por columna un select de una columna no concedida devuelve 403 —
-- o sea que la tienda entera se cae, no se degrada. Agregar la columna a esa
-- lista sin este GRANT rompe las 4 tiendas en producción.
--
-- POR QUÉ ES SEGURO PUBLICARLA: dice en qué unidad se vende el producto (KG,
-- LITRO, UNIDAD), no cuánto cuesta producirlo. Es exactamente lo que el
-- catálogo necesita mostrar para no mentir: "$8.500" en una carnicería sin
-- aclarar que es por kilo es un precio equivocado, no un precio incompleto.
-- Sigue afuera todo lo sensible: `precio_costo` y `tratamiento_iva` NO se
-- conceden acá.
-- ---------------------------------------------------------------------------
grant select (unidad_medida) on public.productos to anon;

do $$
begin
  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'productos'
      and column_name = 'unidad_medida' and grantee = 'anon'
      and privilege_type = 'SELECT'
  ) then
    raise exception 'anon no quedo con SELECT sobre productos.unidad_medida';
  end if;

  -- El costo NUNCA sale al catálogo. Va como guard porque este archivo es el
  -- precedente de "conceder una columna de productos a anon".
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'productos'
      and column_name in ('precio_costo', 'tratamiento_iva') and grantee = 'anon'
  ) then
    raise exception 'anon quedo con acceso a una columna sensible de productos';
  end if;
end;
$$;
