-- Venta de productos serializados: enlaza ventas_items con la unidad física
-- vendida y marca la unidad en un UPDATE condicional todo-o-nada.
--
-- Alcance deliberado: NO se toca devoluciones ni garantías, y los productos
-- que no usan unidades_serie siguen vendiéndose exactamente igual que antes
-- (la columna nueva queda NULL y las RPC no se llaman).

-- ---------------------------------------------------------------------------
-- 1. Trazabilidad: venta > ventas_items > unidad_serie > producto_variante
-- ---------------------------------------------------------------------------

ALTER TABLE public.ventas_items
  ADD COLUMN IF NOT EXISTS unidad_serie_id uuid
    REFERENCES public.unidades_serie(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ventas_items.unidad_serie_id IS
  'Unidad física (IMEI/serie) que salió en esta línea. NULL para productos no serializados, que es el caso normal en indumentaria.';

-- Parcial: la enorme mayoría de las líneas de venta no son serializadas y
-- nunca entran en esta consulta.
CREATE INDEX IF NOT EXISTS idx_ventas_items_unidad_serie
  ON public.ventas_items (unidad_serie_id)
  WHERE unidad_serie_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Marcar unidades como vendidas — todo o nada
-- ---------------------------------------------------------------------------

/*
  Recibe pares (unidad, variante) y marca TODAS o NINGUNA.

  Tres cosas que hacen que el mismo IMEI no se pueda vender dos veces:

    a) `AND estado = 'disponible'` en el WHERE. Es un UPDATE condicional: la
       fila queda bloqueada por el propio UPDATE, así que dos ventas
       concurrentes del mismo IMEI se serializan y la segunda no matchea.
       Un SELECT previo NO sirve — las dos leerían 'disponible' y las dos
       escribirían (mismo bug que ya apareció en cancel-sale.ts y en
       aprobar_orden_compra).

    b) El chequeo de ROW_COUNT contra la cantidad pedida, ANTES de devolver.
       Si alguna unidad ya estaba vendida, o no existe, o no pertenece a la
       variante que dice la línea, el RAISE revierte el UPDATE entero: no
       queda media venta con dos aparatos marcados de tres.

    c) `AND producto_variante_id = ...` — el id de unidad viaja desde el
       cliente. Sin esto, un request modificado podría marcar como vendida
       la unidad de otro producto. Mismo criterio que revalidar el precio
       server-side en create-sale.ts: nada que venga del cliente se usa sin
       verificar contra la base.

  La función es la unidad de atomicidad de este paso. El resto de la venta
  (stock, cabecera, pagos) sigue siendo la secuencia de llamadas que ya
  existía; create-sale.ts llama a esta RPC ANTES de descontar stock y
  revierte con `revertir_unidades_serie` si un paso posterior falla.
*/
CREATE OR REPLACE FUNCTION public.vender_unidades_serie(
  p_venta_id uuid,
  p_unidades jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_esperadas integer;
  v_afectadas integer;
BEGIN
  v_esperadas := jsonb_array_length(p_unidades);

  IF v_esperadas IS NULL OR v_esperadas = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.unidades_serie u
  SET estado = 'vendido',
      fecha_venta = now(),
      venta_id = p_venta_id
  FROM jsonb_to_recordset(p_unidades)
       AS pedido(unidad_id uuid, variante_id uuid)
  WHERE u.id = pedido.unidad_id
    AND u.producto_variante_id = pedido.variante_id
    AND u.estado = 'disponible';

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;

  IF v_afectadas <> v_esperadas THEN
    RAISE EXCEPTION
      'UNIDADES_NO_DISPONIBLES: se pidieron % unidades y solo % estaban disponibles para esa variante',
      v_esperadas, v_afectadas
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_afectadas;
END;
$$;

REVOKE ALL ON FUNCTION public.vender_unidades_serie(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vender_unidades_serie(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Revertir — compensación cuando un paso POSTERIOR de la venta falla
-- ---------------------------------------------------------------------------

/*
  Devuelve al stock las unidades que esta venta había marcado.

  Condicionada a `venta_id = p_venta_id` para que solo pueda deshacer lo
  que ella misma marcó: nunca puede liberar una unidad de otra venta.

  fecha_venta vuelve a NULL porque el CHECK
  unidades_serie_estado_fecha_coherente exige que 'disponible' no tenga
  fecha — la unidad no arrastra la fecha de una venta que no ocurrió.

  NO es un reemplazo de devoluciones: esto solo corre dentro del mismo
  request de create-sale.ts, cuando la venta nunca llegó a existir.
*/
CREATE OR REPLACE FUNCTION public.revertir_unidades_serie(p_venta_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_afectadas integer;
BEGIN
  UPDATE public.unidades_serie
  SET estado = 'disponible',
      fecha_venta = NULL,
      venta_id = NULL
  WHERE venta_id = p_venta_id
    AND estado = 'vendido';

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  RETURN v_afectadas;
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_unidades_serie(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revertir_unidades_serie(uuid) TO authenticated;
