-- ============================================================
-- resumen_gerencial_caja(p_fecha) — capa de datos de la Vista Gerencial
--
-- Agregación de UN día operativo: ventas, breakdown por medio de pago y
-- estado de caja de TODOS los turnos (no solo los del usuario). Solo
-- lectura.
--
-- Es SECURITY DEFINER por dos razones:
--   1. Chequea `tiene_permiso('caja.ver_gerencial')` ella misma y aborta
--      si falta — el gate no puede vivir solo en la UI.
--   2. Necesita ver los turnos, pagos y egresos de todas las cajeras. Con
--      la sesión de un usuario, las policies POR_USUARIO le esconden lo
--      ajeno y el total saldría corto en silencio (mismo motivo por el
--      que existe `calcular_egresos_turno`).
--
-- Definición de "el día": los turnos cuya FECHA_APERTURA cae en p_fecha,
-- hora local. Ventas, pagos y egresos se toman por `turno_caja_id`, no
-- por su propia fecha — un turno abierto 23:40 y cerrado 00:30 es un
-- solo arqueo, y así es como cierra la caja en el mostrador. Hoy no hay
-- ninguna fila con turno_caja_id nulo en las 3 bases, así que este
-- anclaje no pierde nada; si algún día se permite vender con la caja
-- cerrada, esas ventas quedarían fuera y hay que revisar esto.
--
-- Zona horaria fija: el negocio es Tostado, Santa Fe. `now()` es UTC y a
-- las 21:00 local ya es el día siguiente en UTC — sin el `at time zone`
-- el corte del día parte la jornada al medio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.resumen_gerencial_caja(p_fecha date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz    constant text := 'America/Argentina/Buenos_Aires';
  v_fecha date;
  v_out   jsonb;
BEGIN
  IF NOT public.tiene_permiso('caja.ver_gerencial') THEN
    RAISE EXCEPTION 'No tenés permiso para ver el resumen gerencial de caja'
      USING ERRCODE = '42501';
  END IF;

  v_fecha := COALESCE(p_fecha, (now() AT TIME ZONE v_tz)::date);

  WITH turnos_dia AS (
    SELECT id, estado, monto_inicial, monto_declarado
    FROM public.turnos_caja
    WHERE (fecha_apertura AT TIME ZONE v_tz)::date = v_fecha
  ),

  -- Plata que efectivamente se movió: incluye las cobranzas de cuenta
  -- corriente (PAGO_CUENTA_CORRIENTE), que son deuda vieja cobrada hoy y
  -- por lo tanto SÍ están en el cajón. Se marcan aparte más abajo.
  pagos AS (
    SELECT vp.venta_id, vp.metodo_tipo, vp.monto_bruto, vp.tipo_movimiento
    FROM public.venta_pagos vp
    JOIN turnos_dia t ON t.id = vp.turno_caja_id
    WHERE vp.estado_pago_operacion <> 'ANULADO'
  ),

  ventas_dia AS (
    SELECT v.id, v.monto_pendiente
    FROM public.ventas v
    JOIN turnos_dia t ON t.id = v.turno_caja_id
    WHERE v.estado_operacion <> 'ANULADA'
  ),

  -- Buckets fijos para que la UI no cambie de forma según lo que se haya
  -- vendido ese día. TARJETA es UNO solo: hoy `metodos_pago.tipo` no
  -- distingue crédito de débito, así que separarlos acá sería inventar el
  -- dato. Cuando exista esa columna, se parte este bucket.
  canonicos(tipo) AS (
    VALUES ('EFECTIVO'), ('TRANSFERENCIA'), ('TARJETA')
  ),
  -- El UNION deja pasar cualquier tipo no canónico que aparezca en datos
  -- (ej. BILLETERA_VIRTUAL, que existe en pagos viejos de Evens y ya no
  -- está en metodos_pago). Preferimos un bucket extra a plata que se
  -- evapora del total.
  tipos AS (
    SELECT tipo FROM canonicos
    UNION
    SELECT metodo_tipo FROM pagos
  ),
  medios AS (
    SELECT
      metodo_tipo AS tipo,
      SUM(monto_bruto) AS monto,
      COUNT(DISTINCT venta_id) FILTER (WHERE venta_id IS NOT NULL) AS cantidad_ventas,
      COALESCE(SUM(monto_bruto) FILTER (
        WHERE tipo_movimiento = 'PAGO_CUENTA_CORRIENTE'
      ), 0) AS monto_cobranzas_cc
    FROM pagos
    GROUP BY metodo_tipo
  ),
  breakdown AS (
    SELECT
      t.tipo,
      COALESCE(m.monto, 0) AS monto,
      COALESCE(m.cantidad_ventas, 0) AS cantidad_ventas,
      COALESCE(m.monto_cobranzas_cc, 0) AS monto_cobranzas_cc
    FROM tipos t
    LEFT JOIN medios m ON m.tipo = t.tipo
  ),

  egresos_dia AS (
    SELECT COALESCE(SUM(e.monto), 0) AS total
    FROM public.egresos e
    JOIN turnos_dia t ON t.id = e.turno_caja_id
  ),

  caja AS (
    SELECT
      (SELECT COALESCE(SUM(monto_inicial), 0) FROM turnos_dia) AS fondo_inicial,
      (SELECT COALESCE(SUM(monto_bruto), 0) FROM pagos
        WHERE metodo_tipo = 'EFECTIVO') AS ingresos_efectivo,
      (SELECT total FROM egresos_dia) AS egresos_efectivo,
      (SELECT COUNT(*) FROM turnos_dia) AS turnos_totales,
      -- Cualquier estado que no sea CERRADO cuenta como abierto: es la
      -- lectura fail-closed. Un estado nuevo no debe habilitar por
      -- descuido una diferencia que todavía no se puede calcular.
      (SELECT COUNT(*) FROM turnos_dia WHERE estado <> 'CERRADO') AS turnos_abiertos,
      (SELECT COALESCE(SUM(monto_declarado), 0) FROM turnos_dia
        WHERE estado = 'CERRADO') AS real_declarado
  )

  SELECT jsonb_build_object(
    'fecha', v_fecha,
    'generado_en', now(),

    'ventas', jsonb_build_object(
      -- Solo PAGO_VENTA: lo cobrado por ventas de hoy. Las cobranzas de
      -- cuenta corriente NO son venta del día, van en su propio bloque.
      'total_cobrado', (SELECT COALESCE(SUM(monto_bruto), 0) FROM pagos
                         WHERE tipo_movimiento = 'PAGO_VENTA'),
      'cantidad_ventas', (SELECT COUNT(DISTINCT venta_id) FROM pagos
                           WHERE tipo_movimiento = 'PAGO_VENTA'
                             AND venta_id IS NOT NULL)
    ),

    'cuenta_corriente', jsonb_build_object(
      -- Fiado OTORGADO hoy: sale de monto_pendiente, no del método de la
      -- venta. Una venta PARCIAL cobra una parte y fía el resto; filtrar
      -- por metodo_pago='CUENTA_CORRIENTE' se comería la parte cobrada.
      'fiado_otorgado', (SELECT COALESCE(SUM(monto_pendiente), 0) FROM ventas_dia),
      'cantidad_ventas_con_fiado', (SELECT COUNT(*) FROM ventas_dia
                                     WHERE monto_pendiente > 0),
      -- Cobranzas de deuda vieja. Plata real que entró hoy, ya contada
      -- dentro de breakdown_medios; se expone aparte para poder explicar
      -- por qué el efectivo del cajón supera a las ventas del día.
      'cobranzas_monto', (SELECT COALESCE(SUM(monto_bruto), 0) FROM pagos
                           WHERE tipo_movimiento = 'PAGO_CUENTA_CORRIENTE'),
      'cobranzas_cantidad', (SELECT COUNT(*) FROM pagos
                              WHERE tipo_movimiento = 'PAGO_CUENTA_CORRIENTE')
    ),

    'breakdown_medios', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'tipo', tipo,
          'monto', monto,
          'cantidad_ventas', cantidad_ventas,
          'monto_cobranzas_cc', monto_cobranzas_cc
        ) ORDER BY monto DESC, tipo
      ), '[]'::jsonb)
      FROM breakdown
    ),

    'caja', (
      SELECT jsonb_build_object(
        'fondo_inicial', c.fondo_inicial,
        'ingresos_efectivo', c.ingresos_efectivo,
        'egresos_efectivo', c.egresos_efectivo,
        -- Esperado en vivo: misma fórmula que cerrarTurnoAction, pero
        -- sumada sobre todos los turnos del día. No se lee
        -- turnos_caja.efectivo_esperado porque en un turno abierto ese
        -- campo todavía tiene el monto de apertura, no el acumulado.
        'esperado', c.fondo_inicial + c.ingresos_efectivo - c.egresos_efectivo,
        'turnos_totales', c.turnos_totales,
        'turnos_abiertos', c.turnos_abiertos,
        'cierre_completo', (c.turnos_totales > 0 AND c.turnos_abiertos = 0),
        -- Real y diferencia SOLO con el día entero cerrado. Con un turno
        -- abierto, monto_declarado todavía no existe para ese turno y la
        -- resta daría un faltante enorme e inventado.
        'real_declarado', CASE
          WHEN c.turnos_totales > 0 AND c.turnos_abiertos = 0
          THEN c.real_declarado END,
        'diferencia', CASE
          WHEN c.turnos_totales > 0 AND c.turnos_abiertos = 0
          THEN c.real_declarado - (c.fondo_inicial + c.ingresos_efectivo - c.egresos_efectivo)
          END
      )
      FROM caja c
    )
  )
  INTO v_out;

  RETURN v_out;
END;
$function$;

-- anon no tiene nada que hacer acá: es información de gestión interna.
REVOKE ALL ON FUNCTION public.resumen_gerencial_caja(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_gerencial_caja(date) TO authenticated;
