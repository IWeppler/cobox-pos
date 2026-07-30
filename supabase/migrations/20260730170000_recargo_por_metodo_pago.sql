-- Recargo por método de pago: lo que el comercio le COBRA al cliente por
-- pagar con ese método (ej. +15% con tarjeta).
--
-- OJO, no confundir con `metodos_pago.comision`, que ya existía y es lo
-- CONTRARIO: lo que el comercio le PAGA al procesador. La comisión se resta
-- (monto_neto = monto_bruto - comision_monto) y nunca se le muestra al
-- cliente; el recargo se suma al ticket y sí se le muestra. Conviven:
-- primero se suma el recargo, y la comisión se calcula sobre el bruto ya
-- recargado, porque eso es exactamente lo que pasa por el posnet.
--
-- Modelo de datos en venta_pagos (invariante que sostiene toda la feature):
--
--     monto_bruto = monto_base + recargo_monto
--
--   * monto_base   — lo que este cobro imputa al ticket / a la deuda.
--   * recargo_monto — lo que se cobró de más por el método.
--   * monto_bruto  — la plata que efectivamente entró (lo que ve la caja).
--
-- Guardar el recargo desglosado y no solo el bruto es lo que permite después
-- distinguir "vendí más" de "cobré recargo financiero" en reportes, y es la
-- misma razón por la que comision_porcentaje/comision_monto ya se guardaban
-- congelados en la fila: el % del método puede cambiar mañana y los tickets
-- viejos tienen que seguir explicando su propio número.

-- ---------------------------------------------------------------------------
-- 1. El % configurable, por método
-- ---------------------------------------------------------------------------
ALTER TABLE public.metodos_pago
  ADD COLUMN IF NOT EXISTS recargo_porcentaje numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.metodos_pago'::regclass
      AND conname = 'metodos_pago_recargo_porcentaje_check'
  ) THEN
    -- Fail-closed, mismo criterio que el resto del proyecto: un recargo
    -- negativo (un descuento encubierto, sin trazabilidad de promoción) o
    -- un 1500% por dedo pegado no deben poder entrar a la tabla.
    ALTER TABLE public.metodos_pago
      ADD CONSTRAINT metodos_pago_recargo_porcentaje_check
      CHECK (recargo_porcentaje >= 0 AND recargo_porcentaje <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.metodos_pago.recargo_porcentaje IS
  'Recargo % que se le suma al cliente por pagar con este método (0 = sin recargo). NO es la comisión del procesador, que es `comision` y se resta.';

-- ---------------------------------------------------------------------------
-- 2. El desglose congelado, por cobro
-- ---------------------------------------------------------------------------
ALTER TABLE public.venta_pagos
  ADD COLUMN IF NOT EXISTS monto_base numeric,
  ADD COLUMN IF NOT EXISTS recargo_porcentaje numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recargo_monto numeric NOT NULL DEFAULT 0;

-- Backfill: todo lo cobrado hasta hoy fue sin recargo, así que la base es el
-- bruto entero. Se hace ANTES del NOT NULL para que la tabla histórica pase.
UPDATE public.venta_pagos
SET monto_base = monto_bruto
WHERE monto_base IS NULL;

ALTER TABLE public.venta_pagos
  ALTER COLUMN monto_base SET DEFAULT 0;

ALTER TABLE public.venta_pagos
  ALTER COLUMN monto_base SET NOT NULL;

COMMENT ON COLUMN public.venta_pagos.monto_base IS
  'Parte del cobro que imputa al ticket o a la deuda. monto_bruto = monto_base + recargo_monto.';
COMMENT ON COLUMN public.venta_pagos.recargo_monto IS
  'Recargo por método cobrado en este pago, ya redondeado al peso. Congelado: no se recalcula si después cambia el % del método.';

-- ---------------------------------------------------------------------------
-- 3. Total del recargo a nivel ticket
-- ---------------------------------------------------------------------------
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS recargo_metodo_total numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ventas.recargo_metodo_total IS
  'Suma de los recargos por método de este ticket. Ya está incluido en `total` y en `monto_cobrado`; se guarda aparte para poder descontarlo del margen de producto en reportes.';

-- ---------------------------------------------------------------------------
-- 4. El catálogo público necesita leer el recargo (y NADA más)
-- ---------------------------------------------------------------------------
-- El catálogo muestra "+15% con tarjeta" antes de que el cliente pida por
-- WhatsApp, así que anon tiene que poder leer metodos_pago. Pero la misma
-- tabla tiene `comision`, que es información interna del negocio (cuánto le
-- cobra el procesador): abrirla entera filtraría eso a cualquiera que mire
-- el request. Por eso van las dos cosas juntas y no una sola:
--
--   * GRANT por columna — recorta QUÉ columnas puede pedir anon. Sin esto,
--     una policy permisiva alcanza para leer `comision`.
--   * POLICY con `activo` — recorta QUÉ filas. Sin esto, el grant no sirve
--     de nada porque RLS bloquea todo.
REVOKE SELECT ON public.metodos_pago FROM anon;

GRANT SELECT (id, nombre, tipo, recargo_porcentaje, activo)
  ON public.metodos_pago TO anon;

DROP POLICY IF EXISTS metodos_pago_select_anon ON public.metodos_pago;

CREATE POLICY metodos_pago_select_anon
  ON public.metodos_pago
  FOR SELECT
  TO anon
  USING (activo);
