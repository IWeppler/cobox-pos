-- Identidad SaaS: un usuario puede pertenecer a varios negocios.
-- perfiles pasa a ser el usuario global (nombre, email) y la pertenencia vive
-- en usuarios_negocios, con el rol POR NEGOCIO.
-- SOLO para bases multi-tenant (hoy: evens-project).

-- rol_id tiene que ser un rol DEL MISMO negocio de la membresía. Un CHECK no
-- puede mirar otra tabla, así que se resuelve con FK compuesta.
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_id_negocio_id_key;
ALTER TABLE public.roles ADD CONSTRAINT roles_id_negocio_id_key UNIQUE (id, negocio_id);

CREATE TABLE IF NOT EXISTS public.usuarios_negocios (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
    negocio_id  uuid NOT NULL REFERENCES public.negocios(id) ON DELETE CASCADE,
    rol_id      uuid NOT NULL,
    -- Espejo de texto del rol, igual que perfiles.rol: lo consume el código
    -- viejo que todavía no pasó por tiene_permiso(). ENCARGADO se mapea a
    -- VENDEDOR acá también.
    rol         text NOT NULL DEFAULT 'VENDEDOR',
    es_owner    boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_negocios_unico UNIQUE (usuario_id, negocio_id),
    CONSTRAINT usuarios_negocios_rol_fkey
        FOREIGN KEY (rol_id, negocio_id) REFERENCES public.roles(id, negocio_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_negocios_usuario ON public.usuarios_negocios (usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_negocios_negocio ON public.usuarios_negocios (negocio_id);

-- Un solo owner por negocio.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_negocios_un_owner
    ON public.usuarios_negocios (negocio_id) WHERE es_owner;

-- Backfill de las cuentas que ya existen: cada perfil entra al negocio que
-- tenía, con su rol_id actual.
INSERT INTO public.usuarios_negocios (usuario_id, negocio_id, rol_id, rol)
SELECT p.id, p.negocio_id, p.rol_id,
       CASE WHEN r.nombre = 'ENCARGADO' THEN 'VENDEDOR' ELSE r.nombre END
FROM public.perfiles p
JOIN public.roles r ON r.id = p.rol_id
WHERE p.negocio_id IS NOT NULL
ON CONFLICT (usuario_id, negocio_id) DO NOTHING;

-- El ADMIN más viejo de cada negocio queda como dueño.
UPDATE public.usuarios_negocios un
SET es_owner = true
WHERE un.id IN (
    SELECT DISTINCT ON (u.negocio_id) u.id
    FROM public.usuarios_negocios u
    JOIN public.roles r ON r.id = u.rol_id
    JOIN public.perfiles p ON p.id = u.usuario_id
    WHERE r.nombre = 'ADMIN'
    ORDER BY u.negocio_id, p.creado_en
);

ALTER TABLE public.usuarios_negocios ENABLE ROW LEVEL SECURITY;

-- OJO: acá NO va una policy RESTRICTIVE de negocio. El selector de negocio del
-- login necesita leer las membresías del usuario ANTES de que haya un negocio
-- activo; si se filtra por current_negocio_id() no puede haber login múltiple.
DROP POLICY IF EXISTS usuarios_negocios_select_propio ON public.usuarios_negocios;
CREATE POLICY usuarios_negocios_select_propio ON public.usuarios_negocios
    FOR SELECT TO authenticated
    USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS usuarios_negocios_admin_del_negocio ON public.usuarios_negocios;
CREATE POLICY usuarios_negocios_admin_del_negocio ON public.usuarios_negocios
    FOR ALL TO authenticated
    USING (negocio_id = security.current_negocio_id() AND public.is_admin())
    WITH CHECK (negocio_id = security.current_negocio_id() AND public.is_admin());
