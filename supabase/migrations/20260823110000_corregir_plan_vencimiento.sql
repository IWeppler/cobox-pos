-- El vencimiento vuelve a decir la verdad.
--
-- QUÉ PASABA: la migración 20260803010000 asignó planes a los comercios
-- migrados con `plan_vencimiento = now() + interval '12 months'`. Era un valor
-- SEMILLA para que no aparecieran vencidos ese día, no una fecha real.
--
-- Nunca se corrigió sola porque `registrarPagoAction` solo mueve el
-- vencimiento hacia ADELANTE (`if periodoHasta > vencimientoActual`). Con la
-- semilla en 2027, ningún pago mensual de 2026 la superaba: la condición daba
-- false y el update se salteaba. El guard está bien —un pago no puede acortar
-- una suscripción— pero contra un dato semilla inventado nunca iba a disparar.
--
-- Síntoma: los tres comercios que pagaron mostraban "vence 2/8/2027" mientras
-- su último período pagado terminaba en septiembre de 2026.
--
-- LA REGLA: el vencimiento es el fin del último período PAGADO. Sin pagos, es
-- el fin de la prueba (14 días desde el alta, igual que
-- `crear_negocio_con_owner`).
--
-- CONSECUENCIA A LA VISTA: Ninja Camisetas pasa de no tener vencimiento a
-- tener uno ya vencido (2026-08-17). Es correcto: nunca pagó y su prueba
-- terminó. Antes eso estaba escondido detrás de un null.

update public.negocios n
set plan_vencimiento = coalesce(
  (select max(p.periodo_hasta) from public.pagos_suscripcion p
    where p.negocio_id = n.id),
  (n.created_at + interval '14 days')::date
);
