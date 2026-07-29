-- Métodos de pago por default para un comercio NUEVO.
--
-- Igual que seed_catalogo_electro() (20260728160000): queda como FUNCIÓN y NO
-- se ejecuta acá. `supabase/migrations/` es una carpeta compartida por los
-- tres proyectos, así que un INSERT suelto entraría en Evens y Click, que ya
-- tienen sus métodos cargados y en uso.
--
-- Al 29/7/2026:
--   Evens  -> Efectivo, TARJETA BANCO NACION, TARJETA SANTA FE,
--             TRANSFERENCIA MERCADO PAGO
--   Click  -> Efectivo, Transf. Mercado Pago, Transferencia Bancaria
--
-- La guarda es "tabla vacía", no "no existe este nombre". Es a propósito: los
-- nombres reales de cada comercio no coinciden con los del seed (Evens llama
-- "TRANSFERENCIA MERCADO PAGO" a lo que acá es "Mercado Pago"), así que un
-- chequeo por nombre insertaría duplicados semánticos al lado de los que ya
-- usan. Y metodos_pago está referenciada por ventas.metodo_pago_id: un método
-- duplicado ensucia los reportes de forma difícil de deshacer.
--
-- Idempotente: se puede correr las veces que haga falta.

CREATE OR REPLACE FUNCTION public.seed_metodos_pago_default()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_existentes int;
BEGIN
  SELECT count(*) INTO v_existentes FROM public.metodos_pago;

  IF v_existentes > 0 THEN
    RETURN format(
      'Sin cambios: el comercio ya tiene %s método(s) de pago cargado(s).',
      v_existentes
    );
  END IF;

  -- comision 0 y acreditacion_dias 0 en los tres: son los valores de arranque
  -- razonables. La dueña los ajusta después desde Configuración > Métodos de
  -- Pago, que es justo para lo que existe ese panel.
  INSERT INTO public.metodos_pago (nombre, tipo, comision, acreditacion_dias, activo)
  VALUES
    ('Efectivo',      'EFECTIVO',          0, 0, true),
    ('Transferencia', 'TRANSFERENCIA',     0, 0, true),
    ('Mercado Pago',  'BILLETERA_VIRTUAL', 0, 0, true);

  RETURN 'Seed métodos de pago OK: 3 métodos creados.';
END;
$function$;

COMMENT ON FUNCTION public.seed_metodos_pago_default() IS
  'Siembra Efectivo/Transferencia/Mercado Pago en un comercio nuevo. Idempotente y no-op si la tabla ya tiene filas. NO se ejecuta automáticamente: llamarla solo al dar de alta un comercio.';
