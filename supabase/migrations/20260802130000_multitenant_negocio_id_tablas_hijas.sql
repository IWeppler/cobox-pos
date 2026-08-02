-- Multi-tenant paso 4: negocio_id en las tablas hijas.
-- Tenían policies USING (true) y ninguna columna de negocio, así que el
-- aislamiento del paso 3 no las cubría: precios, stock, items de venta y
-- auditoría quedaban visibles entre negocios.
-- SOLO para bases multi-tenant (hoy: evens-project).
--
-- planes y permisos quedan FUERA a propósito: son catálogo global de la
-- plataforma, no datos de un negocio.

DO $$
DECLARE
    r record;
    v_nulos bigint;
    -- tabla, columna FK local, tabla padre, columna del padre
    mapeo text[][] := ARRAY[
        ['producto_variantes',            'producto_id',   'productos',              'id'],
        ['productos_stock',               'producto_id',   'productos',              'id'],
        ['producto_variante_valores',     'variante_id',   'producto_variantes',     'id'],
        ['atributo_valores',              'atributo_id',   'atributos',              'id'],
        ['categoria_atributos',           'categoria_id',  'categorias',             'id'],
        ['bajas',                         'producto_id',   'productos',              'id'],
        ['ordenes_items',                 'orden_id',      'ordenes_compra',         'id'],
        ['ventas_items',                  'venta_id',      'ventas',                 'id'],
        ['ventas_descuentos',             'venta_id',      'ventas',                 'id'],
        ['promociones_productos',         'promocion_id',  'promociones',            'id'],
        ['promociones_categorias',        'promocion_id',  'promociones',            'id'],
        ['promociones_metodos_pago',      'promocion_id',  'promociones',            'id'],
        ['actualizaciones_precio',        'creado_por',    'perfiles',               'id'],
        ['actualizaciones_precio_items',  'lote_id',       'actualizaciones_precio', 'id'],
        ['rol_permisos',                  'rol_id',        'roles',                  'id'],
        ['producto_variantes_auditoria',  'producto_id',   'productos',              'id']
    ];
    i int;
    t text; fk text; padre text; pk text;
BEGIN
    FOR i IN 1 .. array_length(mapeo, 1) LOOP
        t     := mapeo[i][1];
        fk    := mapeo[i][2];
        padre := mapeo[i][3];
        pk    := mapeo[i][4];

        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS negocio_id uuid', t);

        EXECUTE format(
            'UPDATE public.%I h SET negocio_id = p.negocio_id FROM public.%I p '
            'WHERE p.%I = h.%I AND h.negocio_id IS NULL', t, padre, pk, fk);

        -- producto_variantes_auditoria no tiene FK dura contra productos a
        -- propósito (tiene que sobrevivir al borrado del original), así que
        -- puede quedar huérfana. Con un solo negocio la asignación no es
        -- ambigua; con varios habría que decidir a mano y por eso corta.
        EXECUTE format('SELECT count(*) FROM public.%I WHERE negocio_id IS NULL', t) INTO v_nulos;
        IF v_nulos > 0 THEN
            IF (SELECT count(*) FROM public.negocios) = 1 THEN
                EXECUTE format(
                    'UPDATE public.%I SET negocio_id = (SELECT id FROM public.negocios) '
                    'WHERE negocio_id IS NULL', t);
            ELSE
                RAISE EXCEPTION
                    'Backfill incompleto: % filas huerfanas en %s y hay mas de un negocio', v_nulos, t;
            END IF;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN negocio_id SET NOT NULL', t);
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN negocio_id SET DEFAULT security.current_negocio_id()', t);

        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t||'_negocio_id_fkey');
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (negocio_id) REFERENCES public.negocios(id)',
            t, t||'_negocio_id_fkey');

        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (negocio_id)', 'idx_'||t||'_negocio_id', t);

        -- RESTRICTIVE y solo para authenticated: la lectura anon del catálogo
        -- sigue como está hasta el paso 5.
        EXECUTE format('DROP POLICY IF EXISTS aislamiento_negocio ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY aislamiento_negocio ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
            'USING (security.same_negocio(negocio_id)) '
            'WITH CHECK (security.same_negocio(negocio_id))', t);
    END LOOP;
END $$;
