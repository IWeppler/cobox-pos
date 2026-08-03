-- Datos fiscales del COMERCIO (Configuración → Comercio → Datos de la Empresa).
--
-- El formulario y el ticket ya usaban estas 6 columnas (ConfiguracionPOS las
-- declara y TicketPanel lee condicion_iva), pero no existían en ninguna de las
-- 3 bases: cada guardado moría con PGRST204 "Could not find the 'condicion_iva'
-- column". PostgREST avisa de a UNA columna por vez, así que el error iba a
-- reaparecer 6 veces seguidas si se agregaba de a una.
--
-- OJO: `localidad` NO es `localidad_negocio`. Esta es la del domicilio fiscal
-- (ticket/factura); `localidad_negocio` es la que usa el catálogo público para
-- decidir si un envío es local. Son dos datos distintos que casualmente suelen
-- coincidir, y unificarlos rompería el cálculo de envíos.

ALTER TABLE public.configuracion_pos
    ADD COLUMN IF NOT EXISTS razon_social       text,
    ADD COLUMN IF NOT EXISTS cuit               text,
    ADD COLUMN IF NOT EXISTS condicion_iva      text,
    ADD COLUMN IF NOT EXISTS inicio_actividades date,
    ADD COLUMN IF NOT EXISTS provincia          text,
    ADD COLUMN IF NOT EXISTS localidad          text;

-- Fail-closed, igual que clientes.condicion_iva y configuracion_pos.rubro: un
-- valor fuera de la lista no entra. NULL sí (comercio que todavía no cargó sus
-- datos fiscales, que es el estado inicial de todos).
ALTER TABLE public.configuracion_pos DROP CONSTRAINT IF EXISTS configuracion_pos_condicion_iva_check;
ALTER TABLE public.configuracion_pos ADD CONSTRAINT configuracion_pos_condicion_iva_check
    CHECK (condicion_iva IS NULL OR condicion_iva IN (
        'Responsable Inscripto','Monotributo','Exento','Consumidor Final'
    ));

COMMENT ON COLUMN public.configuracion_pos.localidad IS
    'Localidad del domicilio fiscal (ticket/factura). Para envíos del catálogo, ver localidad_negocio.';
