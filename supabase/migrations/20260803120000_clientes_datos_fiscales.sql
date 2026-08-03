-- Datos fiscales del cliente (Factura A / B).
--
-- El formulario de alta/edición ya mandaba cuit, razon_social, condicion_iva y
-- el domicilio fiscal, pero las columnas no existían en NINGUNA de las 3 bases:
-- PostgREST rechazaba el insert entero con PGRST204 y el alta fallaba con
-- "No se pudo crear el cliente" sin decir por qué.
--
-- Todo nullable: la enorme mayoría de las ventas son a consumidor final y el
-- cliente fiscal es la excepción, no la regla.

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS cuit           text,
    ADD COLUMN IF NOT EXISTS razon_social   text,
    ADD COLUMN IF NOT EXISTS condicion_iva  text,
    ADD COLUMN IF NOT EXISTS direccion      text,
    ADD COLUMN IF NOT EXISTS localidad      text,
    ADD COLUMN IF NOT EXISTS provincia      text,
    ADD COLUMN IF NOT EXISTS codigo_postal  text;

-- Fail-closed, mismo criterio que configuracion_pos.rubro: una condición de IVA
-- desconocida no entra. NULL sí (cliente no fiscal).
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_condicion_iva_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_condicion_iva_check
    CHECK (condicion_iva IS NULL OR condicion_iva IN (
        'Responsable Inscripto','Monotributo','Exento','Consumidor Final'
    ));

COMMENT ON COLUMN public.clientes.cuit IS
    'CUIT sin guiones. Solo para clientes fiscales; el DNI (columna dni) es el dato del consumidor final.';
