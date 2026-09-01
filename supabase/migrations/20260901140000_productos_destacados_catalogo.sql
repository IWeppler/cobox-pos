-- Productos destacados de la portada del catálogo público.
--
-- El problema: la portada muestra "Recién llegados", que son los 8 productos
-- con `creado_en` más nuevo. Eso funciona cuando el catálogo está cargado hace
-- rato, y falla justo cuando más se mira — mientras se están subiendo las
-- fotos, los 8 más nuevos son exactamente los que TODAVÍA no tienen imagen, y
-- la vidriera abre con ocho recuadros grises.
--
-- La solución no es adivinar cuáles se ven bien sino dejar que el comercio los
-- elija: 8 productos marcados a mano desde Inventario, que son los que la
-- portada muestra siempre.
--
-- Por qué timestamptz y no un boolean: el orden en que se muestran tiene que
-- salir de algún lado, y "el último que marcaste va primero" es un criterio
-- que no necesita una segunda columna ni una UI de arrastrar. Además deja ver
-- CUÁNDO se armó la vidriera, que es lo primero que se pregunta cuando quedó
-- vieja. null = no destacado.
--
-- El tope de 8 NO es un CHECK ni un trigger: es una regla de producto, no una
-- invariante de integridad. Lo aplica `bulkToggleDestacadoAction` (que cuenta
-- antes de escribir) y, como red, la portada recorta a 8 igual. Un estado con
-- 9 destacados no corrompe nada: muestra los 8 más recientes.
begin;

alter table public.productos
  add column if not exists destacado_en timestamptz;

comment on column public.productos.destacado_en is
  'Cuándo se marcó este producto como destacado de la portada del catálogo. '
  'null = no destacado. La portada muestra los 8 con la marca más reciente; '
  'el tope de 8 lo aplica la app (bulkToggleDestacadoAction), no la base.';

-- Parcial: los destacados son 8 por negocio sobre catálogos de cientos o miles
-- de filas, así que indexar los null sería indexar todo para nada.
create index if not exists productos_destacados_idx
  on public.productos (negocio_id, destacado_en desc)
  where destacado_en is not null;

-- anon lo lee: la portada la calcula el server con la anon key
-- (createPublicClient), y con GRANT por columna pedirla sin conceder es 403 y
-- se cae la tienda entera. Mismo criterio que 20260819192526 con unidad_medida.
-- No expone nada del comercio: dice qué productos eligió mostrar primero, que
-- es justamente lo que el visitante ve en la portada.
grant select (destacado_en) on public.productos to anon;

commit;
