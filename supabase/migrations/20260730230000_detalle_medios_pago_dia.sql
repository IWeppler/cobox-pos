-- ============================================================
-- detalle_medios_pago_dia(p_fecha) — filas del expandible de la Vista
-- Gerencial: cada cobro del día, para desplegar bajo su medio de pago.
--
-- Mismo criterio de día, mismo gate de permiso y mismo motivo de
-- SECURITY DEFINER que `resumen_gerencial_caja` (ver esa migración).
-- Los montos de acá suman exactamente el `monto` de cada bucket del
-- resumen: es el mismo conjunto de filas, sin agregar.
--
-- Devuelve el detalle del día completo de una, en vez de una llamada por
-- medio al expandir: son ~200 filas en el día más cargado de Evens, y
-- así abrir un acordeón no dispara un spinner.
-- ============================================================

CREATE OR REPLACE FUNCTION public.detalle_medios_pago_dia(p_fecha date DEFAULT NULL)
 RETURNS TABLE (
   pago_id       uuid,
   venta_id      uuid,
   metodo_tipo   text,
   metodo_nombre text,
   monto         numeric,
   es_cobranza_cc boolean,
   fecha         timestamptz,
   vendedor      text,
   cliente       text
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz    constant text := 'America/Argentina/Buenos_Aires';
  v_fecha date;
BEGIN
  IF NOT public.tiene_permiso('caja.ver_gerencial') THEN
    RAISE EXCEPTION 'No tenés permiso para ver el resumen gerencial de caja'
      USING ERRCODE = '42501';
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
    -- El vendedor sale del turno, no del pago: un cobro de cuenta
    -- corriente no tiene venta asociada y por lo tanto no tiene
    -- vendedor propio, pero sí cayó en la caja de alguien.
    perf.nombre,
    cli.nombre
  FROM public.venta_pagos vp
  JOIN public.turnos_caja t ON t.id = vp.turno_caja_id
  LEFT JOIN public.perfiles perf ON perf.id = t.vendedor_id
  LEFT JOIN public.clientes cli ON cli.id = vp.cliente_id
  WHERE (t.fecha_apertura AT TIME ZONE v_tz)::date = v_fecha
    AND vp.estado_pago_operacion <> 'ANULADO'
  ORDER BY vp.creado_en DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.detalle_medios_pago_dia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detalle_medios_pago_dia(date) TO authenticated;
