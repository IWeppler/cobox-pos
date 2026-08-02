-- Devolución de productos serializados: al anular una venta, la unidad
-- física tiene que salir del limbo. Hasta acá `vender_unidades_serie` la
-- marcaba 'vendido' y NADA la devolvía (la migración 20260731160000 dejó
-- devoluciones explícitamente fuera de alcance), así que anular una venta
-- restauraba el stock de la variante pero dejaba ese IMEI inservible para
-- siempre: contado en stock, imposible de elegir en el POS.
--
-- `revertir_unidades_serie` NO sirve para esto: es compensación dentro del
-- mismo request de create-sale, para una venta que nunca llegó a existir.
-- Acá la venta existió, se cobró y se anula — son dos casos distintos y la
-- diferencia se ve en el estado final de la unidad.

-- ---------------------------------------------------------------------------
-- 1. Tercer estado: 'baja'
-- ---------------------------------------------------------------------------

/*
  El aparato volvió fallado. No es 'disponible' (no se puede revender) ni
  'vendido' (no está en la calle, y contarlo como venta ensucia el reporte).

  fecha_venta queda libre para 'baja': hoy una baja siempre viene de una
  venta anulada y conserva su fecha, pero un aparato que llega roto del
  proveedor también va a poder darse de baja sin haberse vendido nunca.
  Los otros dos estados mantienen la coherencia estricta de siempre.
*/
ALTER TABLE public.unidades_serie
  DROP CONSTRAINT IF EXISTS unidades_serie_estado_check;

ALTER TABLE public.unidades_serie
  ADD CONSTRAINT unidades_serie_estado_check
  CHECK (estado = ANY (ARRAY['disponible'::text, 'vendido'::text, 'baja'::text]));

ALTER TABLE public.unidades_serie
  DROP CONSTRAINT IF EXISTS unidades_serie_estado_fecha_coherente;

ALTER TABLE public.unidades_serie
  ADD CONSTRAINT unidades_serie_estado_fecha_coherente
  CHECK (
    (estado = 'vendido' AND fecha_venta IS NOT NULL)
    OR (estado = 'disponible' AND fecha_venta IS NULL)
    OR estado = 'baja'
  );

-- ---------------------------------------------------------------------------
-- 2. Devolver las unidades de una venta anulada
-- ---------------------------------------------------------------------------

/*
  Espeja el motivo de la anulación, que es la misma decisión que ya toma
  cancel-sale.ts para el stock de la variante:

    p_a_stock = true  (RESTAURAR_STOCK) -> el aparato vuelve a la vitrina.
    p_a_stock = false (BAJA)            -> volvió roto, sale de circulación.

  Dos condiciones en el WHERE, las dos necesarias:

    a) `venta_id = p_venta_id` — solo puede tocar lo que esta venta marcó.
       Nunca libera la unidad de otra venta.

    b) `estado = 'vendido'` — UPDATE condicional, no un SELECT previo. Hace
       la operación idempotente: dos anulaciones concurrentes de la misma
       venta se serializan en la fila y la segunda afecta 0 filas en vez de
       "devolver" dos veces el mismo aparato. Mismo criterio que
       aprobar_orden_compra y cancel-sale.

  En el camino a stock se limpia venta_id: la unidad vuelve a estar libre y
  no puede quedar apuntando a una venta anulada (violaría la premisa de
  `revertir_unidades_serie` y de la disponibilidad). La trazabilidad no se
  pierde: ventas_items.unidad_serie_id conserva el vínculo y la venta queda
  con estado_operacion = 'ANULADA'.

  Devuelve la cantidad de unidades efectivamente devueltas. cancel-sale NO
  aborta la anulación si esto falla — para cuando corre, la venta ya está
  anulada y la plata ya se devolvió; frenar acá dejaría algo peor.
*/
CREATE OR REPLACE FUNCTION public.devolver_unidades_venta(
  p_venta_id uuid,
  p_a_stock boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_afectadas integer;
BEGIN
  IF p_a_stock THEN
    UPDATE public.unidades_serie
    SET estado = 'disponible',
        fecha_venta = NULL,
        venta_id = NULL
    WHERE venta_id = p_venta_id
      AND estado = 'vendido';
  ELSE
    -- Conserva venta_id y fecha_venta: es la única forma de saber de qué
    -- venta volvió este aparato roto.
    UPDATE public.unidades_serie
    SET estado = 'baja'
    WHERE venta_id = p_venta_id
      AND estado = 'vendido';
  END IF;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  RETURN v_afectadas;
END;
$$;

REVOKE ALL ON FUNCTION public.devolver_unidades_venta(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.devolver_unidades_venta(uuid, boolean) TO authenticated;
