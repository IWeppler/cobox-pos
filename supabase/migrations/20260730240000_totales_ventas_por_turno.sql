-- ============================================================
-- totales_ventas_por_turno(p_turno_ids) — total facturado por turno, para
-- la fila de nivel "día" del Historial de Cajas.
--
-- Por qué RPC y no un SELECT sobre ventas desde el cliente: la policy de
-- turnos_caja deja ver un turno si es propio, si tenés
-- caja.cerrar_ajena, O si el modo es 'UNICA' (caja compartida por todo
-- el local). En ese último caso un vendedor ve turnos de sus compañeras,
-- pero la policy de `ventas` solo le muestra las propias — el total del
-- día le saldría corto y sin ningún aviso. Mismo problema que resolvió
-- `calcular_egresos_turno`.
--
-- Es SECURITY DEFINER pero NO es un bypass: el WHERE de abajo repite la
-- condición de `turnos_caja_select_propio_o_admin` tal cual. Si podés ver
-- el turno, ves su total; si no, el turno no vuelve. Si algún día cambia
-- esa policy, hay que cambiar esta condición junto con ella.
--
-- Total = suma de `ventas.total` (lo FACTURADO, incluye lo que se fió).
-- Ojo: no es lo mismo que `ventas.total_cobrado` de
-- `resumen_gerencial_caja`, que es lo efectivamente cobrado. En un día
-- con fiado los dos números difieren, y es correcto que difieran.
-- ============================================================

CREATE OR REPLACE FUNCTION public.totales_ventas_por_turno(p_turno_ids uuid[])
 RETURNS TABLE (
   turno_id        uuid,
   total_facturado numeric,
   cantidad_ventas bigint
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
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
  WHERE t.id = ANY(p_turno_ids)
    AND (
      t.vendedor_id = auth.uid()
      OR public.tiene_permiso('caja.cerrar_ajena')
      OR t.modo = 'UNICA'
    )
  GROUP BY t.id;
$function$;

REVOKE ALL ON FUNCTION public.totales_ventas_por_turno(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totales_ventas_por_turno(uuid[]) TO authenticated;
