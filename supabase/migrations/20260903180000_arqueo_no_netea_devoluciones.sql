-- Por qué el arqueo NO resta las devoluciones, escrito donde se lo va a tocar.
--
-- Esta migración no cambia comportamiento: solo deja COMMENT en las dos
-- funciones del arqueo. Existe porque la conclusión es contraintuitiva y el
-- error que evita mueve plata.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LA TENTACIÓN
--
-- Al agregar `ventas.monto_devuelto` (20260903160000) lo natural es recorrer
-- todo lo que suma ventas y restarle lo devuelto. En el arqueo eso está MAL y
-- produce un faltante fantasma.
--
-- El arqueo no suma `ventas.total`: arma la plata desde `venta_pagos`
-- (lo que entró) menos `egresos` (lo que salió). Y una devolución en efectivo
-- YA inserta su egreso — lo hace `registrar_devolucion`, con concepto
-- 'Devolucion parcial - Venta #XXXX' y el turno abierto de ese momento.
--
-- Entonces:
--
--   esperado = fondo_inicial + ingresos_efectivo - egresos_efectivo
--                                                   ↑ acá ya está la devolución
--
-- Restarla otra vez de `ingresos_efectivo` la contaría DOS veces, y el turno
-- cerraría con un faltante igual a la devolución. Es exactamente el bug que
-- `anular_venta` tuvo al revés en agosto (sacaba del cajón plata cobrada con
-- débito) y que costó un arqueo descuadrado por cada anulación.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Y `totales_ventas_por_turno` TAMPOCO
--
-- Devuelve "Vendido" por turno: lo que se vendió en ESE turno, que es un hecho
-- histórico. Una devolución de tres días después no puede bajar el número de
-- un turno ya cerrado — un turno cerrado es inmutable para todos, y ese número
-- se lee al lado del efectivo declarado con el que cuadró.
--
-- Dónde SÍ se netea: en los reportes de rentabilidad, que responden "cuánto
-- ganamos" y no "cuánta plata hay en el cajón". Ver `get-dashboard-metrics.ts`
-- y las columnas de devolución de la exportación de Ventas.

begin;

comment on function public.resumen_gerencial_caja(date) is
  'Resumen del dia para caja. NO resta ventas.monto_devuelto y no debe hacerlo: '
  'la plata sale de venta_pagos menos egresos, y una devolucion en efectivo ya '
  'inserto su egreso. Restarla de nuevo la contaria dos veces y el turno '
  'cerraria con faltante. Ver 20260903180000.';

comment on function public.totales_ventas_por_turno(uuid[]) is
  'Vendido por turno. NO resta ventas.monto_devuelto: es lo que se vendio en '
  'ese turno, un hecho historico, y una devolucion posterior no puede cambiar '
  'el numero de un turno ya cerrado. Ver 20260903180000.';

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resumen_gerencial_caja'
       and obj_description(p.oid, 'pg_proc') is not null
  ) then
    raise exception 'No quedo el comentario en resumen_gerencial_caja.';
  end if;
end $$;

commit;
