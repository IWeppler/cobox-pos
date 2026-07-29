-- T4 — Flag de rubro + columnas condicionales en Inventario.
--
-- El flag vive en configuracion_pos (una fila por comercio), no en una tabla
-- nueva: es un solo valor por comercio y ya hay ahí toda la config de POS,
-- caja y catálogo. Default 'indumentaria' para que Evens y Estilo Bonito no
-- cambien de comportamiento al aplicar esto.

ALTER TABLE public.configuracion_pos
  ADD COLUMN IF NOT EXISTS rubro text NOT NULL DEFAULT 'indumentaria';

-- Fail-closed, mismo criterio que el resto del proyecto: un rubro
-- desconocido no debe entrar y quedar mostrando la UI equivocada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.configuracion_pos'::regclass
      AND conname = 'configuracion_pos_rubro_check'
  ) THEN
    ALTER TABLE public.configuracion_pos
      ADD CONSTRAINT configuracion_pos_rubro_check
      CHECK (rubro IN ('indumentaria','electro'));
  END IF;
END $$;

-- Mismo patrón que `marca` (20260724145718): texto libre, nullable, sin
-- catálogo de valores detrás.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS modelo text;

-- ---------------------------------------------------------------------------
-- Seed de categorías y atributos de electro
-- ---------------------------------------------------------------------------
-- OJO: esto queda como FUNCIÓN y NO se ejecuta acá. `supabase/migrations/` es
-- una carpeta compartida por los tres proyectos, así que un INSERT suelto
-- sembraría "Celulares" y "Frigorías" dentro de Evens y Estilo Bonito, que son
-- de indumentaria. La función se llama a mano solo en el proyecto de electro.
--
-- Los slugs replican shared/utils/slugify.ts (NFKD, sin acentos, minúsculas,
-- espacios a guiones): Resolución -> resolucion, Frigorías -> frigorias,
-- Aires Acondicionados -> aires-acondicionados.
--
-- Idempotente: se puede correr las veces que haga falta.

CREATE OR REPLACE FUNCTION public.seed_catalogo_electro()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_cat record;
  v_atributos text[];
  v_atributo text;
  v_cat_id uuid;
  v_atr_id uuid;
  v_orden int;
  v_links int := 0;
BEGIN
  -- 1. Las 4 categorías raíz de electro
  INSERT INTO public.categorias (nombre, slug, orden, activa)
  VALUES
    ('Celulares',            'celulares',            10, true),
    ('Tablets',              'tablets',              20, true),
    ('Televisores',          'televisores',          30, true),
    ('Aires Acondicionados', 'aires-acondicionados', 40, true)
  ON CONFLICT (slug) WHERE parent_id IS NULL DO NOTHING;

  -- 2. Los atributos. `Color` puede existir ya si el proyecto tuvo
  --    indumentaria antes; el ON CONFLICT lo reusa en vez de duplicarlo.
  INSERT INTO public.atributos (nombre, slug, tipo, orden, activo)
  VALUES
    ('Almacenamiento', 'almacenamiento', 'TEXT', 10, true),
    ('RAM',            'ram',            'TEXT', 20, true),
    ('Color',          'color',          'TEXT', 30, true),
    ('Pulgadas',       'pulgadas',       'TEXT', 40, true),
    ('Resolución',     'resolucion',     'TEXT', 50, true),
    ('Frigorías',      'frigorias',      'TEXT', 60, true),
    ('Tipo',           'tipo',           'TEXT', 70, true)
  ON CONFLICT (slug) DO NOTHING;

  -- 3. Qué atributos aplican a cada categoría
  FOR v_cat IN
    SELECT * FROM (VALUES
      ('celulares',            ARRAY['almacenamiento','ram','color']),
      ('tablets',              ARRAY['almacenamiento','ram','color']),
      ('televisores',          ARRAY['pulgadas','resolucion']),
      ('aires-acondicionados', ARRAY['frigorias','tipo'])
    ) AS t(cat_slug, atributos)
  LOOP
    SELECT id INTO v_cat_id
    FROM public.categorias
    WHERE slug = v_cat.cat_slug AND parent_id IS NULL;

    CONTINUE WHEN v_cat_id IS NULL;

    v_atributos := v_cat.atributos;
    v_orden := 0;

    FOREACH v_atributo IN ARRAY v_atributos LOOP
      v_orden := v_orden + 10;

      SELECT id INTO v_atr_id FROM public.atributos WHERE slug = v_atributo;
      CONTINUE WHEN v_atr_id IS NULL;

      INSERT INTO public.categoria_atributos
        (categoria_id, atributo_id, requerido, orden)
      VALUES (v_cat_id, v_atr_id, false, v_orden)
      ON CONFLICT (categoria_id, atributo_id) DO NOTHING;

      v_links := v_links + 1;
    END LOOP;
  END LOOP;

  RETURN format('Seed electro OK: %s vínculos categoría-atributo procesados.', v_links);
END;
$function$;

COMMENT ON FUNCTION public.seed_catalogo_electro() IS
  'Siembra las 4 categorías y 7 atributos de electro. Idempotente. NO se ejecuta automáticamente: llamarla solo en proyectos con configuracion_pos.rubro = ''electro''.';
