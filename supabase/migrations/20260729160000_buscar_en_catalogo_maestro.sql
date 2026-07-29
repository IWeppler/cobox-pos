-- T2/T6 — Búsqueda por TEXTO en el Catálogo Maestro.
--
-- Hasta ahora el maestro solo se consultaba por EAN exacto
-- (buscar-en-maestro.ts: .eq("ean_gtin", codigo)). Al 29/7/2026 son 354 de
-- 1267 filas sin ean_gtin — un cuarto del catálogo era inalcanzable. Caso
-- real: "Motorola Edge 50 Fusion" no aparecía ni escaneando ni tipeando.
--
-- ---------------------------------------------------------------------------
-- Por qué NO alcanza similarity() sola, ni word_similarity() sola
-- ---------------------------------------------------------------------------
-- similarity() compara los dos textos COMPLETOS, así que castiga la
-- diferencia de largo: similarity('moto', 'Motorola Edge 50 Fusion') ~ 0.10.
-- Con cualquier umbral usable, tipear un prefijo no encuentra nada.
--
-- word_similarity() mide cuánto del texto tipeado aparece dentro de una
-- porción contigua del nombre, así que resuelve el prefijo — pero SATURA:
-- da 1.000 para todo lo que contenga el fragmento. Medido sobre estos datos,
-- "moto" devolvía 1.000 tanto para un celular Motorola como para
-- "Auriculares Powerbank Gamer para Motorola Moto Color G24". Sin ranking
-- útil, los 3 candidatos que ve el empleado pueden ser los 3 equivocados.
--
-- Se usan las dos: word_similarity FILTRA (recall, tolera prefijos) y el
-- promedio con similarity ORDENA (precisión, penaliza el ruido alrededor del
-- match). Verificado sobre los 1267 registros reales: "motorola edge 50
-- fusion" devuelve los 3 Motorola correctos, "samsung a54" pone el A54 5G
-- primero y los A55 después.
--
-- Se reusa el patrón de sugerir_productos_similares (20260725234456)
-- —unaccent_immutable + lower + trigram, SET search_path = '', SECURITY
-- INVOKER— pero no su métrica: allá se comparan dos nombres completos de
-- productos, acá un fragmento tipeado contra un nombre largo.
--
-- ---------------------------------------------------------------------------
-- Deduplicación
-- ---------------------------------------------------------------------------
-- El maestro tiene duplicados reales ("Samsung Galaxy Naos" x13, "Compresor
-- Rotativo 3000 Frigorias" x13, cada uno con su id_master). Sin DISTINCT ON,
-- los 3 candidatos que ve el empleado son la MISMA fila repetida. Se agrupa
-- por (nombre_comercial, marca, modelo_oficial) y gana la que tiene ean_gtin
-- cargado: es la más completa para precargar el alta.
--
-- ---------------------------------------------------------------------------
-- Umbral
-- ---------------------------------------------------------------------------
-- Default 0.45, más bajo que el 0.75 de la conciliación de indumentaria: acá
-- el resultado se le OFRECE al empleado para que elija, no se auto-confirma.
-- Un falso positivo cuesta un click; un falso negativo lo manda a tipear todo
-- a mano, que es el problema que estamos resolviendo.
--
-- ---------------------------------------------------------------------------
-- Índices y performance
-- ---------------------------------------------------------------------------
-- No se crea ninguno: idx_catalogo_maestro_nombre_trgm y
-- idx_catalogo_maestro_modelo_trgm (20260728150000) ya son GIN trigram sobre
-- las mismas expresiones.
--
-- Igual esta query hace seq scan: el filtro es la expresión word_similarity,
-- no el operador <% (que usa pg_trgm.word_similarity_threshold = 0.6, más
-- alto que nuestro 0.45, y se comería candidatos válidos). Con 1267 filas es
-- de milisegundos. Si el maestro crece a decenas de miles con el
-- crowdsourcing de T7, revisar acá: la salida es bajar el GUC por sesión y
-- prefiltrar con <% para poder apoyarse en el índice.
--
-- ---------------------------------------------------------------------------
-- Guarda de proyecto
-- ---------------------------------------------------------------------------
-- catalogo_maestro vive SOLO en el proyecto del maestro (hoy Click). Como
-- supabase/migrations/ es compartida por los tres proyectos, el CREATE
-- FUNCTION va adentro de un DO con chequeo de existencia: en Evens y Estilo
-- Bonito es un no-op en vez de un "relation does not exist" que cortaría el
-- db push entero.

DO $do$
BEGIN
  IF to_regclass('public.catalogo_maestro') IS NULL THEN
    RAISE NOTICE 'catalogo_maestro no existe en este proyecto: se omite buscar_en_catalogo_maestro().';
    RETURN;
  END IF;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.buscar_en_catalogo_maestro(
      p_query text,
      p_umbral real DEFAULT 0.45,
      p_limite integer DEFAULT 3
    )
    RETURNS TABLE(
      id_master uuid,
      categoria text,
      marca text,
      modelo_oficial text,
      nombre_comercial text,
      ean_gtin text,
      variante_atributos jsonb,
      score real
    )
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
    AS $fn$
      WITH entrada AS (
        SELECT public.unaccent_immutable(lower(btrim(p_query))) AS q
      ),
      scored AS (
        SELECT
          c.id_master, c.categoria, c.marca, c.modelo_oficial,
          c.nombre_comercial, c.ean_gtin, c.variante_atributos,
          -- El empleado puede tipear el nombre comercial ("edge 50 fusion") o
          -- marca+modelo ("motorola edge 50"). Se evalúan los dos y gana el
          -- mejor, en vez de obligarlo a adivinar cuál cargó el maestro.
          greatest(
            extensions.word_similarity(e.q, public.unaccent_immutable(lower(c.nombre_comercial))),
            extensions.word_similarity(e.q, public.unaccent_immutable(lower(c.marca || ' ' || c.modelo_oficial)))
          ) AS word_sim,
          greatest(
            extensions.similarity(e.q, public.unaccent_immutable(lower(c.nombre_comercial))),
            extensions.similarity(e.q, public.unaccent_immutable(lower(c.marca || ' ' || c.modelo_oficial)))
          ) AS sim
        FROM public.catalogo_maestro c
        CROSS JOIN entrada e
        WHERE e.q <> ''
      ),
      filtrados AS (
        SELECT *, (0.5 * word_sim + 0.5 * sim)::real AS mixto
        FROM scored
        WHERE word_sim >= p_umbral
      ),
      dedup AS (
        SELECT DISTINCT ON (
          public.unaccent_immutable(lower(nombre_comercial)), marca, modelo_oficial
        ) *
        FROM filtrados
        ORDER BY
          public.unaccent_immutable(lower(nombre_comercial)), marca, modelo_oficial,
          -- Entre duplicados gana el que trae EAN: precarga más completa.
          (ean_gtin IS NULL), mixto DESC
      )
      SELECT
        id_master, categoria, marca, modelo_oficial,
        nombre_comercial, ean_gtin, variante_atributos, mixto AS score
      FROM dedup
      -- Desempate estable: sin el segundo criterio, dos filas con el mismo
      -- score salen en orden arbitrario y la lista "baila" entre búsquedas
      -- iguales.
      ORDER BY mixto DESC, nombre_comercial ASC
      LIMIT greatest(p_limite, 0);
    $fn$;
  $ddl$;

  -- El comercio consulta el maestro SIEMPRE como anon (ver
  -- shared/config/supabase/catalogo-maestro.ts: sin sesión ni cookies), así
  -- que sin este grant a anon la búsqueda falla en producción aunque ande
  -- probándola desde el SQL Editor.
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.buscar_en_catalogo_maestro(text, real, integer) TO anon, authenticated';

  EXECUTE $c$
    COMMENT ON FUNCTION public.buscar_en_catalogo_maestro(text, real, integer) IS
      'Búsqueda difusa por texto en el catálogo maestro. word_similarity filtra, promedio con similarity ordena, DISTINCT ON deduplica. Devuelve candidatos para que el empleado elija: NO auto-confirma.'
  $c$;
END
$do$;
