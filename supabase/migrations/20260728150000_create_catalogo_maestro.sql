-- T2 — Catálogo Maestro. Tabla compartida que cualquier comercio consulta
-- para no tener que tipear especificaciones de productos de electro.
--
-- Modelo de escritura (fail-closed, igual criterio que el resto del proyecto):
-- se habilita SOLO lectura por RLS. NO hay política de INSERT/UPDATE/DELETE,
-- así que con RLS activo anon y authenticated no pueden escribir ni por error.
-- La escritura crowdsourced del "efecto Waze" (T7) entra por Edge Function o
-- RPC controlada usando service_role, que no pasa por RLS. Si en T7 se decide
-- hacerlo por RPC en vez de Edge Function, esa RPC debe ser SECURITY DEFINER
-- y forzar estado='pendiente_revision' adentro, nunca confiar en el valor que
-- manda el cliente — mismo criterio que create-sale.ts con los precios.

CREATE TABLE public.catalogo_maestro (
  id_master uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,               -- Celulares | Tablets | Televisores | Aires Acondicionados
  marca text NOT NULL,
  modelo_oficial text NOT NULL,
  nombre_comercial text NOT NULL,
  ean_gtin text UNIQUE,
  variante_atributos jsonb,              -- {"almacenamiento":"128GB","ram":"4GB","color":"Black"}
  especificaciones_tecnicas text,
  url_imagen text,
  estado text NOT NULL DEFAULT 'verificado'
    CHECK (estado IN ('verificado','pendiente_revision')),
  origen text NOT NULL DEFAULT 'seed_ia', -- seed_ia | crowdsourced | manual
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Nota: NO se crea un índice aparte sobre ean_gtin. El UNIQUE de la columna
-- ya crea un índice B-tree usable por `WHERE ean_gtin = $1`; agregar
-- idx_catalogo_maestro_ean habría duplicado el mismo índice, con doble costo
-- de escritura en el seed de 700 productos de T3 y cero ganancia de lectura.

-- Búsqueda difusa por nombre y modelo, que es como va a consultar Carga
-- Rápida en T5 (el EAN no siempre viene en el remito). Mismo patrón que
-- 20260725234456_add_sugerir_productos_similares: unaccent_immutable + GIN
-- trigram, para que las consultas puedan usar similarity() y el operador %.
CREATE INDEX idx_catalogo_maestro_nombre_trgm
  ON public.catalogo_maestro
  USING gin (public.unaccent_immutable(lower(nombre_comercial)) extensions.gin_trgm_ops);

CREATE INDEX idx_catalogo_maestro_modelo_trgm
  ON public.catalogo_maestro
  USING gin (public.unaccent_immutable(lower(modelo_oficial)) extensions.gin_trgm_ops);

-- Navegación por rubro y marca (listados y filtros del lado del comercio).
CREATE INDEX idx_catalogo_maestro_categoria_marca
  ON public.catalogo_maestro (categoria, marca);

-- Para la cola de revisión de T7: los pendientes son pocos contra el total,
-- así que el índice va parcial.
CREATE INDEX idx_catalogo_maestro_pendientes
  ON public.catalogo_maestro (creado_en)
  WHERE estado = 'pendiente_revision';

-- ---------------------------------------------------------------------------
-- RLS: lectura pública, escritura cerrada
-- ---------------------------------------------------------------------------

ALTER TABLE public.catalogo_maestro ENABLE ROW LEVEL SECURITY;

-- Lectura para cualquiera con la publishable key, de cualquier proyecto.
-- El maestro no tiene datos sensibles: son specs de productos de fábrica.
CREATE POLICY "Lectura pública del catálogo maestro"
  ON public.catalogo_maestro
  FOR SELECT TO anon, authenticated
  USING (true);

-- Sin políticas de INSERT/UPDATE/DELETE a propósito: con RLS habilitado y sin
-- política, la escritura queda denegada para anon y authenticated. service_role
-- sigue pasando por encima de RLS, que es por donde entra T7.

COMMENT ON TABLE public.catalogo_maestro IS
  'Catálogo maestro compartido de productos de electro. Lectura pública; escritura solo vía service_role (Edge Function / RPC controlada de T7).';
