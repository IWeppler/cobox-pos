-- El tope de clientes con cuenta corriente deja de poder voltear una venta.
--
-- Regla: una operación en curso no se rompe por un límite comercial. Si el
-- comercio llega al tope justo cuando está cobrando, la venta se completa y el
-- freno aparece la próxima vez que se abra deuda A MANO. Perder una venta en
-- el mostrador —con la clienta esperando y la mercadería sobre el vidrio— es
-- un daño mucho mayor que dejar pasar un cliente por encima del cupo.
--
-- El discriminador NO es nuevo: un movimiento de cuenta corriente con
-- `venta_id` nace de una venta y uno sin `venta_id` es carga manual. Es el
-- mismo criterio con el que la UI decide qué movimiento se puede editar o
-- anular (ver movimiento-cc-card.tsx). Acá se usa para decidir qué puede
-- frenarse.
--
-- Dónde queda el freno entonces:
--   - Saldo inicial y ajustes manuales de deuda -> SÍ frena.
--   - Venta fiada, cobro, recargo por mora      -> NO frena nunca.
--   - `puede_fiar()` se mantiene y pasa a ser AVISO: el POS lo consulta para
--     advertir antes, no para rechazar.

-- ---------------------------------------------------------------------------
-- 1. Fuera el trigger sobre `clientes`.
--
-- Estaba en el lugar equivocado: miraba `saldo_pendiente` subiendo de 0 a
-- positivo, y eso pasa TANTO al fiar en el mostrador como al cargar un saldo
-- inicial. Desde ahí no hay forma de distinguir una cosa de la otra, así que
-- frenaba las dos.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_limite_cuenta_corriente on public.clientes;

-- ---------------------------------------------------------------------------
-- 2. El freno pasa al alta MANUAL de deuda.
--
-- Se cuenta igual que siempre (clientes con saldo pendiente > 0), y no cuenta
-- al cliente que ya debía: el tope es de cuántas cuentas corrientes hay
-- abiertas, no de cuántos movimientos se hacen.
-- ---------------------------------------------------------------------------
create or replace function public.validar_limite_cc_manual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_max      int;
    v_actuales int;
    v_negocio  uuid;
    v_debia    boolean;
BEGIN
    -- Solo el alta manual de deuda. Todo lo que viene de una venta o de un
    -- pago pasa derecho: esa es la regla entera de esta migración.
    IF NEW.tipo <> 'DEBITO' OR NEW.venta_id IS NOT NULL OR NEW.pago_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    SELECT c.negocio_id, c.saldo_pendiente > 0
    INTO v_negocio, v_debia
    FROM public.clientes c WHERE c.id = NEW.cliente_id;

    -- Un cliente que YA tiene deuda abierta no ocupa un lugar nuevo.
    IF v_debia THEN
      RETURN NEW;
    END IF;

    v_max := nullif(
      public.reglas_negocio(v_negocio) ->> 'max_clientes_cuenta_corriente',
      'null'
    )::int;

    IF v_max IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_actuales
    FROM public.clientes c
    WHERE c.negocio_id = v_negocio
      AND c.saldo_pendiente > 0
      AND c.id <> NEW.cliente_id;

    IF v_actuales >= v_max THEN
      RAISE EXCEPTION
        'El plan permite % cliente(s) con cuenta corriente y ya están todos ocupados. Cobrá alguna deuda o pasá a un plan mayor. (Las ventas fiadas no se frenan por esto.)', v_max
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

drop trigger if exists trg_limite_cc_manual on public.cuenta_corriente_movimientos;
create trigger trg_limite_cc_manual
  before insert on public.cuenta_corriente_movimientos
  for each row execute function public.validar_limite_cc_manual();

-- `validar_limite_cuenta_corriente` queda huérfana: se dropea para que nadie
-- la vuelva a colgar de un trigger creyendo que es la vigente.
drop function if exists public.validar_limite_cuenta_corriente();

-- ---------------------------------------------------------------------------
-- 3. `puede_fiar` pasa a ser aviso.
--
-- No cambia su cuenta —sigue diciendo la verdad sobre el cupo— pero se
-- documenta que ya NO es un portón: create-sale la consulta para advertir, no
-- para rechazar la venta.
-- ---------------------------------------------------------------------------
comment on function public.puede_fiar is
  'AVISO, no bloqueo: dice si queda cupo de cuentas corrientes. Desde 20260814170000 una venta fiada NUNCA se rechaza por el tope (ver validar_limite_cc_manual). Sirve para advertir antes de cobrar.';
