-- Tope de clientes con cuenta corriente por plan.
--
-- Qué se cuenta: clientes con saldo distinto de cero, no clientes cargados.
-- El plan vende "fiarle a N clientes", no "tener N contactos en la agenda":
-- cargar un cliente de mostrador que paga al contado no consume el recurso.
--
-- Dónde se aplica:
--   - TRIGGER sobre clientes: es el único choke point real. saldo_pendiente se
--     actualiza desde seis lugares distintos (venta fiada, alta con deuda
--     inicial, ajuste manual, import, anulación, pago) y todos pasan por acá.
--   - create-sale.ts pregunta ANTES de crear la venta con puede_fiar(). Si el
--     trigger frenara recién al actualizar el saldo, la venta ya estaría
--     grabada como fiada y el saldo del cliente sin tocar: plata mal contada.

/**
 * ¿Se le puede fiar a este cliente sin pasarse del plan?
 * Un cliente que YA tiene deuda no ocupa un lugar nuevo.
 */
CREATE OR REPLACE FUNCTION public.puede_fiar(p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.limite_plan('max_clientes_cuenta_corriente') IS NULL THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = p_cliente AND c.saldo_pendiente > 0
    ) THEN true
    ELSE (
      SELECT count(*) FROM public.clientes c
      WHERE c.negocio_id = security.current_negocio_id()
        AND c.saldo_pendiente > 0
    ) < public.limite_plan('max_clientes_cuenta_corriente')
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.puede_fiar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_limite_cuenta_corriente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_max      int;
    v_actuales int;
BEGIN
    -- Solo importa cuando el cliente ENTRA a la cuenta corriente. Pagar,
    -- bajar la deuda o quedar en cero nunca se bloquea.
    IF NEW.saldo_pendiente IS NULL OR NEW.saldo_pendiente <= 0 THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.saldo_pendiente > 0 THEN
      RETURN NEW;
    END IF;

    SELECT nullif(p.reglas ->> 'max_clientes_cuenta_corriente', 'null')::int
    INTO v_max
    FROM public.negocios n
    JOIN public.planes p ON p.id = n.plan_id
    WHERE n.id = NEW.negocio_id;

    -- Sin plan o sin tope declarado no se limita, igual que el resto.
    IF v_max IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_actuales
    FROM public.clientes c
    WHERE c.negocio_id = NEW.negocio_id
      AND c.saldo_pendiente > 0
      AND c.id <> NEW.id;

    IF v_actuales >= v_max THEN
      RAISE EXCEPTION
        'El plan permite % cliente(s) con cuenta corriente y ya están todos ocupados. Cobrá alguna deuda o pasá a un plan mayor.', v_max
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_limite_cuenta_corriente ON public.clientes;
CREATE TRIGGER trg_limite_cuenta_corriente
    BEFORE INSERT OR UPDATE OF saldo_pendiente ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.validar_limite_cuenta_corriente();
