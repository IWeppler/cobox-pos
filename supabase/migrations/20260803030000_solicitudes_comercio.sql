-- Pedidos de alta de comercio que llegan desde el login.
--
-- NO crea un negocio ni una cuenta: el formulario pide datos de contacto, no
-- email ni contraseña, así que no hay con qué armar un usuario. Es un lead que
-- Comerz contesta por WhatsApp y da de alta a mano con crear_negocio_con_owner.

CREATE TABLE IF NOT EXISTS public.solicitudes_comercio (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_contacto text NOT NULL,
    whatsapp        text NOT NULL,
    nombre_comercio text NOT NULL,
    rubro           text NOT NULL,
    -- Sólo cuando rubro = 'otro'; ahí el comerciante escribe el suyo.
    rubro_otro      text,
    estado          text NOT NULL DEFAULT 'NUEVA'
                    CHECK (estado IN ('NUEVA', 'CONTACTADA', 'CONVERTIDA', 'DESCARTADA')),
    notas           text,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT solicitudes_comercio_rubro_check CHECK (
      rubro IN ('quiosco','minimercado','ferreteria','carniceria','indumentaria','otro')
    ),
    -- Si eligió "otro", el texto es obligatorio: si no, queda un lead sin saber
    -- de qué rubro es.
    CONSTRAINT solicitudes_comercio_otro_check CHECK (
      rubro <> 'otro' OR (rubro_otro IS NOT NULL AND btrim(rubro_otro) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_comercio_estado
    ON public.solicitudes_comercio (estado, creado_en DESC);

ALTER TABLE public.solicitudes_comercio ENABLE ROW LEVEL SECURITY;

-- El formulario vive en el login, sin sesión: tiene que poder insertar anon.
-- Sólo INSERT: nadie sin sesión puede leer los datos de contacto de otro.
DROP POLICY IF EXISTS solicitudes_comercio_insert_publico ON public.solicitudes_comercio;
CREATE POLICY solicitudes_comercio_insert_publico ON public.solicitudes_comercio
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Leerlas y gestionarlas es cosa de Comerz.
DROP POLICY IF EXISTS solicitudes_comercio_super_admin ON public.solicitudes_comercio;
CREATE POLICY solicitudes_comercio_super_admin ON public.solicitudes_comercio
    FOR ALL TO authenticated
    USING (security.is_super_admin())
    WITH CHECK (security.is_super_admin());
