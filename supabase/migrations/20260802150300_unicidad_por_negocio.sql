-- Unicidad que quedó global del modelo por-proyecto y en multi-tenant impide
-- que dos negocios usen el mismo nombre: el rol ADMIN, el slug de un producto,
-- una categoría raíz "Camperas". Apareció al crear el segundo negocio, que
-- falló con "duplicate key value violates unique constraint roles_nombre_key".
--
-- Se excluyen a propósito:
--   - los únicos que cuelgan de un padre que ya es de un negocio
--     (atributo_valores, categoria_atributos, producto_variante_valores,
--      productos_stock, rol_permisos, categorias_slug_child_key)
--   - invitaciones.token, que es un secreto aleatorio y global a propósito.

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_nombre_key;
CREATE UNIQUE INDEX IF NOT EXISTS roles_negocio_nombre_key
    ON public.roles (negocio_id, nombre);

ALTER TABLE public.atributos DROP CONSTRAINT IF EXISTS atributos_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS atributos_negocio_slug_key
    ON public.atributos (negocio_id, slug);

ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_slug_key;
DROP INDEX IF EXISTS public.productos_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS productos_negocio_slug_key
    ON public.productos (negocio_id, slug);

DROP INDEX IF EXISTS public.categorias_slug_root_key;
CREATE UNIQUE INDEX IF NOT EXISTS categorias_negocio_slug_root_key
    ON public.categorias (negocio_id, slug) WHERE parent_id IS NULL;

ALTER TABLE public.diccionario_alias
    DROP CONSTRAINT IF EXISTS diccionario_alias_proveedor_raw_nombre_key;
CREATE UNIQUE INDEX IF NOT EXISTS diccionario_alias_negocio_proveedor_raw_key
    ON public.diccionario_alias (negocio_id, proveedor, raw_nombre);

-- El IMEI es único en el mundo, pero acotarlo al negocio evita que el alta de
-- un equipo falle contra una fila de otro comercio que nadie puede ver.
ALTER TABLE public.unidades_serie DROP CONSTRAINT IF EXISTS unidades_serie_imei_key;
DROP INDEX IF EXISTS public.unidades_serie_imei_key;
CREATE UNIQUE INDEX IF NOT EXISTS unidades_serie_negocio_imei_key
    ON public.unidades_serie (negocio_id, imei);

-- Una vendedora que trabaja en dos negocios puede tener caja abierta en cada
-- uno; lo que no puede es tener dos turnos abiertos en el mismo.
DROP INDEX IF EXISTS public.turnos_caja_vendedor_abierto_unico;
CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_negocio_vendedor_abierto_unico
    ON public.turnos_caja (negocio_id, vendedor_id) WHERE estado = 'ABIERTO';
