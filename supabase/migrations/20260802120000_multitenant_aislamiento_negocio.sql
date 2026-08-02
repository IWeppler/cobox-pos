-- Multi-tenant: pasos 1-3 de la auditoría de aislamiento por negocio.
-- SOLO aplica a bases ya migradas a multi-tenant (hoy: evens-project).
-- Estilo Bonito y ClickTostado todavía no tienen negocio_id: no correr ahí.

-- ---------------------------------------------------------------------------
-- PASO 1: security.current_negocio_id() estaba rota.
-- El SELECT final no tenía INTO ni RETURN: plpgsql tira 42601 "query has no
-- destination for result data" para cualquier usuario autenticado, lo que hace
-- explotar toda policy que use same_negocio().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.current_negocio_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id         uuid;
    v_negocio_forzado uuid;
    v_negocio         uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Super admin puede impersonar un negocio vía cookie.
    IF security.is_super_admin() THEN
        BEGIN
            v_negocio_forzado := (current_setting('request.cookies', true)::json ->> 'impersonate_negocio_id')::uuid;
            IF v_negocio_forzado IS NOT NULL THEN
                RETURN v_negocio_forzado;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- cookie ausente o ilegible: sigue el flujo normal
        END;
    END IF;

    SELECT negocio_id INTO v_negocio FROM public.perfiles WHERE id = v_user_id;
    RETURN v_negocio;
END;
$function$;

-- ---------------------------------------------------------------------------
-- PASO 2: aislamiento real.
-- Las policies "Aislamiento por negocio" eran PERMISSIVE y convivían con las
-- viejas USING (true): permissive se combinan con OR, así que no aislaban nada.
-- Se recrean como RESTRICTIVE (AND con todo lo demás) y acotadas a
-- authenticated, para no matar la lectura anon del catálogo público.
-- Además: DEFAULT en negocio_id (si no, todo INSERT que no mande la columna
-- muere contra el WITH CHECK) e índice (las policies filtran por esa columna).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    tablas text[] := ARRAY[
        'atributos','categorias','clientes','configuracion_pos',
        'cuenta_corriente_movimientos','diccionario_alias','egresos',
        'metodos_pago','ordenes_compra','productos','promociones','reservas',
        'roles','turnos_caja','unidades_serie','venta_pagos','ventas'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Aislamiento por negocio', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Aislar productos por negocio', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'aislamiento_negocio', t);

        EXECUTE format(
            'CREATE POLICY aislamiento_negocio ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
            'USING (security.same_negocio(negocio_id)) '
            'WITH CHECK (security.same_negocio(negocio_id))', t);

        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN negocio_id SET DEFAULT security.current_negocio_id()', t);

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (negocio_id)', 'idx_'||t||'_negocio_id', t);
    END LOOP;
END $$;

-- perfiles: aislamiento sí, DEFAULT no. negocio_id es NOT NULL y en el alta el
-- usuario todavía no tiene fila en perfiles, así que el default resolvería NULL.
DROP POLICY IF EXISTS aislamiento_negocio ON public.perfiles;
CREATE POLICY aislamiento_negocio ON public.perfiles
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (security.same_negocio(negocio_id))
    WITH CHECK (security.same_negocio(negocio_id));
CREATE INDEX IF NOT EXISTS idx_perfiles_negocio_id ON public.perfiles (negocio_id);

-- unidades_serie era la única tabla con negocio_id sin FK.
ALTER TABLE public.unidades_serie
    ADD CONSTRAINT unidades_serie_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id);

-- ---------------------------------------------------------------------------
-- PASO 3: tabla negocios.
-- Faltaba slug (identidad del catálogo público). estado ya existía pero
-- nullable y sin CHECK: fail-open. Además RLS activo con 0 policies, o sea
-- que ni el propio dueño podía leer su negocio desde el cliente.
-- ---------------------------------------------------------------------------
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.negocios
SET slug = trim(both '-' FROM regexp_replace(lower(unaccent(nombre)), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL;

ALTER TABLE public.negocios ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS negocios_slug_key ON public.negocios (slug);
CREATE UNIQUE INDEX IF NOT EXISTS negocios_nombre_key ON public.negocios (nombre);

UPDATE public.negocios SET estado = 'activo' WHERE estado IS NULL;
ALTER TABLE public.negocios ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.negocios DROP CONSTRAINT IF EXISTS negocios_estado_check;
ALTER TABLE public.negocios ADD CONSTRAINT negocios_estado_check
    CHECK (estado IN ('activo','suspendido','cancelado'));

-- Sin esto la tabla es ilegible salvo por service_role.
DROP POLICY IF EXISTS negocios_select_propio ON public.negocios;
CREATE POLICY negocios_select_propio ON public.negocios
    FOR SELECT TO authenticated
    USING (id = security.current_negocio_id());
