-- Multi-tenant paso 5: aislar la lectura anónima del catálogo público.
-- Las policies de anon eran USING (true), así que con más de un negocio la
-- tienda mostraría productos, precios y stock de todos mezclados.
-- El negocio se resuelve por el subdominio: el middleware traduce host a slug
-- y lo manda en el header x-negocio-slug.
-- SOLO para bases multi-tenant (hoy: evens-project).

CREATE OR REPLACE FUNCTION security.negocio_publico()
RETURNS uuid
LANGUAGE plpgsql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_slug text;
    v_id   uuid;
    v_total int;
BEGIN
    BEGIN
        v_slug := current_setting('request.headers', true)::json ->> 'x-negocio-slug';
    EXCEPTION WHEN OTHERS THEN
        v_slug := NULL;
    END;

    IF v_slug IS NOT NULL AND v_slug <> '' THEN
        -- Slug desconocido o negocio suspendido devuelve NULL: fail-closed.
        SELECT id INTO v_id FROM public.negocios
        WHERE slug = v_slug AND estado = 'activo';
        RETURN v_id;
    END IF;

    -- Transición: sin header, mientras exista un solo negocio se sirve ese.
    -- Al dar de alta el segundo, esto pasa a NULL solo y la tienda sin
    -- subdominio deja de resolver, en vez de mezclar dos catálogos.
    SELECT count(*) INTO v_total FROM public.negocios;
    IF v_total <> 1 THEN
        RETURN NULL;
    END IF;

    SELECT id INTO v_id FROM public.negocios WHERE estado = 'activo';
    RETURN v_id;
END;
$function$;

GRANT USAGE ON SCHEMA security TO anon;
GRANT EXECUTE ON FUNCTION security.negocio_publico() TO anon;

DO $$
DECLARE
    t text;
    tablas text[] := ARRAY[
        'productos','producto_variantes','producto_variante_valores',
        'productos_stock','categorias','configuracion_pos','promociones',
        'promociones_productos','promociones_categorias','promociones_metodos_pago',
        'metodos_pago'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        EXECUTE format('DROP POLICY IF EXISTS aislamiento_negocio_publico ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY aislamiento_negocio_publico ON public.%I AS RESTRICTIVE FOR ALL TO anon '
            'USING (negocio_id = security.negocio_publico())', t);
    END LOOP;
END $$;
