-- Se elimina el tenant por defecto del catálogo público.
-- security.negocio_publico() caía al "único negocio" cuando no llegaba el
-- header x-negocio-slug. Eso era una muleta de transición mientras Evens era
-- el único: con el segundo negocio deja de ser ambiguo y pasa a ser peligroso
-- (una URL sin tenant mostraría el catálogo de alguien).
-- Ahora: sin slug no hay negocio, y sin negocio no hay catálogo.

CREATE OR REPLACE FUNCTION security.negocio_publico()
RETURNS uuid
LANGUAGE plpgsql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_slug text;
    v_id   uuid;
BEGIN
    BEGIN
        v_slug := current_setting('request.headers', true)::json ->> 'x-negocio-slug';
    EXCEPTION WHEN OTHERS THEN
        v_slug := NULL;
    END;

    IF v_slug IS NULL OR v_slug = '' THEN
        RETURN NULL;
    END IF;

    -- Slug desconocido o negocio suspendido: NULL, fail-closed.
    SELECT id INTO v_id FROM public.negocios
    WHERE slug = v_slug AND estado = 'activo';

    RETURN v_id;
END;
$function$;

-- resolveTenant() necesita traducir slug -> negocio SIN sesión, para saber si
-- la tienda existe antes de decidir entre catálogo y 404. Se expone solo lo
-- que ya es público de cara al cliente: nombre, slug y logo del negocio activo.
DROP POLICY IF EXISTS negocios_select_anon_activo ON public.negocios;
CREATE POLICY negocios_select_anon_activo ON public.negocios
    FOR SELECT TO anon
    USING (estado = 'activo');

REVOKE SELECT ON public.negocios FROM anon;
GRANT SELECT (id, nombre, slug, logo_url, estado) ON public.negocios TO anon;
