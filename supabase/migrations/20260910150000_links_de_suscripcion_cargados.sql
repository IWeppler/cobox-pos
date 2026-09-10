-- ============================================================================
-- LOS LINKS DE ADHESIÓN QUE EXISTEN HOY
-- ============================================================================
--
-- `20260910140000` agregó la columna; esto carga los dos links que ya están
-- creados en Mercado Pago. Va como migración y no aplicado a mano porque el
-- repo tiene que poder reconstruir el schema Y la configuración desde cero:
-- un link cargado solo en producción es un mail de cobro que no sale en
-- cualquier otro entorno, sin ningún error que lo diga.
--
-- Los dos son suscripciones MENSUALES y SIN período de prueba: el cliente que
-- se adhiere paga en el momento. Es lo correcto acá — los 14 días gratis de
-- Comerz los maneja `negocios.plan_vencimiento`, no Mercado Pago, y si además
-- la suscripción tuviera trial la persona se adheriría al final de su prueba y
-- pasaría otras dos semanas sin pagar.
--
-- EMPRESA queda en null a propósito: todavía no tiene plan creado en Mercado
-- Pago. Eso hace que sus mails de cobro no se manden, que es exactamente lo
-- buscado — un aviso de cobro sin cómo pagar es trabajo para el que lo recibe.
-- Hoy no afecta a nadie: el único comercio en Empresa es Kiosco Demo, y los
-- `demo` no reciben mails.
--
-- `where link_suscripcion is null` para no pisar un link cambiado después: si
-- mañana se rehace el plan en Mercado Pago, el valor nuevo está en la base y
-- esta migración no puede devolverlo al viejo.
-- ============================================================================

update public.planes
   set link_suscripcion = 'https://mpago.la/2U2MnGh'
 where nombre = 'Emprendedor'
   and link_suscripcion is null;

update public.planes
   set link_suscripcion = 'https://mpago.la/1LFRiSv'
 where nombre = 'Gestión'
   and link_suscripcion is null;

do $$
declare
  v_sin_link int;
begin
  select count(*) into v_sin_link
  from public.planes
  where nombre in ('Emprendedor', 'Gestión')
    and link_suscripcion is null;

  if v_sin_link > 0 then
    raise exception 'GUARD: quedaron % planes cobrables sin link de adhesion', v_sin_link;
  end if;
end $$;
