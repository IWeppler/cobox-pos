-- 1. Las cuatro funciones de caja son SECURITY DEFINER —saltean RLS por
-- definición— y ninguna filtraba por negocio. resumen_gerencial_caja y
-- detalle_medios_pago_dia consolidaban turnos, ventas, medios de pago, egresos
-- y clientes de TODOS los negocios: el permiso se validaba en el negocio
-- propio, pero los datos no se acotaban a ninguno.
--
-- 2. Se agrega public.negocio_actual(), que es lo que el código necesita para
-- dejar de leer la columna deprecada perfiles.negocio_id (NULL en todo usuario
-- nuevo, y desactualizada para quien trabaja en dos negocios).

CREATE OR REPLACE FUNCTION public.negocio_actual()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT security.current_negocio_id();
$function$;

GRANT EXECUTE ON FUNCTION public.negocio_actual() TO authenticated;

-- ---------------------------------------------------------------------------
-- resumen_gerencial_caja
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumen_gerencial_caja(p_fecha date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  v_fecha   date;
  v_negocio uuid;
  v_out     jsonb;
BEGIN
  IF NOT public.tiene_permiso('caja.ver_gerencial') THEN
    RAISE EXCEPTION 'No tenés permiso para ver el resumen gerencial de caja'
      USING ERRCODE = '42501';
  END IF;

  -- Sin negocio activo no hay caja que resumir. Va después del permiso para
  -- no filtrar por el mensaje de error si existe o no un negocio.
  v_negocio := security.current_negocio_id();
  IF v_negocio IS NULL THEN
    RAISE EXCEPTION 'No hay un negocio activo' USING ERRCODE = '42501';
  END IF;

  v_fecha := COALESCE(p_fecha, (now() AT TIME ZONE v_tz)::date);

  WITH turnos_dia AS (
    -- Este filtro es el que acota TODO lo demás: pagos, ventas y egresos
    -- entran por join contra estos turnos.
    SELECT id, estado, monto_inicial, monto_declarado
    FROM public.turnos_caja
    WHERE (fecha_apertura AT TIME ZONE v_tz)::date = v_fecha
      AND negocio_id = v_negocio
  ),
  pagos AS (
    SELECT vp.venta_id, vp.metodo_tipo, vp.monto_bruto, vp.tipo_movimiento
    FROM public.venta_pagos vp
    JOIN turnos_dia t ON t.id = vp.turno_caja_id
    WHERE vp.estado_pago_operacion <> 'ANULADO'
      AND vp.negocio_id = v_negocio
  ),
  ventas_dia AS (
    SELECT v.id, v.monto_pendiente
    FROM public.ventas v
    JOIN turnos_dia t ON t.id = v.turno_caja_id
    WHERE v.estado_operacion <> 'ANULADA'
      AND v.negocio_id = v_negocio
  ),
  canonicos(tipo) AS (
    VALUES ('EFECTIVO'), ('TRANSFERENCIA'), ('TARJETA')
  ),
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
    WHERE e.negocio_id = v_negocio
  ),
  caja AS (
    SELECT
      (SELECT COALESCE(SUM(monto_inicial), 0) FROM turnos_dia) AS fondo_inicial,
      (SELECT COALESCE(SUM(monto_bruto), 0) FROM pagos
        WHERE metodo_tipo = 'EFECTIVO') AS ingresos_efectivo,
      (SELECT total FROM egresos_dia) AS egresos_efectivo,
      (SELECT COUNT(*) FROM turnos_dia) AS turnos_totales,
      (SELECT COUNT(*) FROM turnos_dia WHERE estado <> 'CERRADO') AS turnos_abiertos,
      (SELECT COALESCE(SUM(monto_declarado), 0) FROM turnos_dia
        WHERE estado = 'CERRADO') AS real_declarado
  )
  SELECT jsonb_build_object(
    'fecha', v_fecha,
    'generado_en', now(),
    'ventas', jsonb_build_object(
      'total_cobrado', (SELECT COALESCE(SUM(monto_bruto), 0) FROM pagos
                         WHERE tipo_movimiento = 'PAGO_VENTA'),
      'cantidad_ventas', (SELECT COUNT(DISTINCT venta_id) FROM pagos
                           WHERE tipo_movimiento = 'PAGO_VENTA'
                             AND venta_id IS NOT NULL)
    ),
    'cuenta_corriente', jsonb_build_object(
      'fiado_otorgado', (SELECT COALESCE(SUM(monto_pendiente), 0) FROM ventas_dia),
      'cantidad_ventas_con_fiado', (SELECT COUNT(*) FROM ventas_dia
                                     WHERE monto_pendiente > 0),
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
        'esperado', c.fondo_inicial + c.ingresos_efectivo - c.egresos_efectivo,
        'turnos_totales', c.turnos_totales,
        'turnos_abiertos', c.turnos_abiertos,
        'cierre_completo', (c.turnos_totales > 0 AND c.turnos_abiertos = 0),
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

-- ---------------------------------------------------------------------------
-- detalle_medios_pago_dia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detalle_medios_pago_dia(p_fecha date DEFAULT NULL::date)
RETURNS TABLE(pago_id uuid, venta_id uuid, metodo_tipo text, metodo_nombre text,
              monto numeric, es_cobranza_cc boolean, fecha timestamp with time zone,
              vendedor text, cliente text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  v_fecha   date;
  v_negocio uuid;
BEGIN
  IF NOT public.tiene_permiso('caja.ver_gerencial') THEN
    RAISE EXCEPTION 'No tenés permiso para ver el resumen gerencial de caja'
      USING ERRCODE = '42501';
  END IF;

  v_negocio := security.current_negocio_id();
  IF v_negocio IS NULL THEN
    RAISE EXCEPTION 'No hay un negocio activo' USING ERRCODE = '42501';
  END IF;

  v_fecha := COALESCE(p_fecha, (now() AT TIME ZONE v_tz)::date);

  RETURN QUERY
  SELECT
    vp.id,
    vp.venta_id,
    vp.metodo_tipo,
    vp.metodo_nombre,
    vp.monto_bruto,
    (vp.tipo_movimiento = 'PAGO_CUENTA_CORRIENTE'),
    vp.creado_en,
    perf.nombre,
    cli.nombre
  FROM public.venta_pagos vp
  JOIN public.turnos_caja t ON t.id = vp.turno_caja_id
  LEFT JOIN public.perfiles perf ON perf.id = t.vendedor_id
  LEFT JOIN public.clientes cli ON cli.id = vp.cliente_id
  WHERE (t.fecha_apertura AT TIME ZONE v_tz)::date = v_fecha
    AND vp.estado_pago_operacion <> 'ANULADO'
    AND vp.negocio_id = v_negocio
    AND t.negocio_id = v_negocio
  ORDER BY vp.creado_en DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- totales_ventas_por_turno
-- El OR t.modo = 'UNICA' alcanzaba turnos de otros negocios: con el UUID se
-- leían sus totales. Ahora el negocio se chequea siempre, antes que el modo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.totales_ventas_por_turno(p_turno_ids uuid[])
RETURNS TABLE(turno_id uuid, total_facturado numeric, cantidad_ventas bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    COALESCE(SUM(v.total), 0),
    COUNT(v.id)
  FROM public.turnos_caja t
  LEFT JOIN public.ventas v
    ON v.turno_caja_id = t.id
   AND v.estado_operacion <> 'ANULADA'
   AND v.negocio_id = security.current_negocio_id()
  WHERE t.id = ANY(p_turno_ids)
    AND t.negocio_id = security.current_negocio_id()
    AND (
      t.vendedor_id = auth.uid()
      OR public.tiene_permiso('caja.cerrar_ajena')
      OR t.modo = 'UNICA'
    )
  GROUP BY t.id;
$function$;

-- ---------------------------------------------------------------------------
-- calcular_egresos_turno
-- No tenía chequeo de permiso NI de negocio: con un uuid de turno ajeno
-- devolvía el total de egresos de otro comercio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_egresos_turno(p_turno_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(e.monto), 0)
  FROM public.egresos e
  JOIN public.turnos_caja t ON t.id = e.turno_caja_id
  WHERE e.turno_caja_id = p_turno_id
    AND e.negocio_id = security.current_negocio_id()
    AND t.negocio_id = security.current_negocio_id();
$function$;
