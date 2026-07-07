-- Limpieza de datos: filtros de catálogo duplicados (Color/Género/Opción N)
--
-- Contexto: el catálogo generaba grupos de filtro duplicados porque
-- "producto_variantes.atributos" (jsonb) tenía inconsistencias de casing en
-- un único producto ("Buzo darlon cuello redondo"), y la tabla relacional
-- "atributos" acumuló 5 filas huérfanas (nombres genéricos autogenerados
-- por el parser legacy, nunca renombradas). El fix de código (query del
-- storefront + parser legacy) ya resuelve el bug en vivo; esta migración
-- limpia los datos persistidos para que sean consistentes de ahora en más.

-- 1. Clave "Genero" (sin tilde) -> "Género" en el jsonb de las 14 variantes
--    de "Buzo darlon cuello redondo" (afd641f1-bec2-4424-a2b3-871c42749c82).
update producto_variantes
set atributos = (atributos - 'Genero') || jsonb_build_object('Género', atributos->>'Genero')
where atributos ? 'Genero';

-- 2. Normalizar valores de Color a Título Case en todos los productos
--    (ej. "NEGRO" -> "Negro", "AZUL" -> "Azul"). Afecta ~312 variantes.
update producto_variantes
set atributos = jsonb_set(atributos, '{Color}', to_jsonb(initcap(atributos->>'Color')))
where atributos ? 'Color'
  and atributos->>'Color' <> initcap(atributos->>'Color');

-- 3. Alinear el nombre de la fila relacional "Genero" (sin tilde) con el
--    jsonb ya corregido. El slug ya es "genero" en ambos casos (sin
--    conflicto de unicidad).
update atributos
set nombre = 'Género'
where id = '45f1b165-8e8a-461f-8f19-9d393412bc7d' and nombre = 'Genero';

-- 4. Borrar filas huérfanas de "atributos" (nombre vacío + "Propiedad 1-4"):
--    0 referencias en producto_variante_valores ni categoria_atributos.
--    Cascada automática a atributo_valores (ON DELETE CASCADE).
delete from atributos
where id in (
  'c3c0c6df-e190-499f-bb5b-6695f94f5b1b', -- nombre/slug vacíos
  '08b78051-2020-44d4-8a50-5d0eb54ea817', -- Propiedad 1
  'd4abc3de-ba0d-439f-bb71-93bd9023caaa', -- Propiedad 2
  'bc80dcca-c20b-4300-8115-38578dcc5ebb', -- Propiedad 3
  'c08415ed-c061-4f38-a830-aa388480b809'  -- Propiedad 4
);
