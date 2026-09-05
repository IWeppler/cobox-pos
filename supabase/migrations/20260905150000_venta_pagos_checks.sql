-- ---------------------------------------------------------------------------
-- `venta_pagos` pasa a ser fail-closed como el resto del esquema.
--
-- Era la única tabla de plata sin un solo CHECK: `tipo_movimiento` y
-- `estado_pago_operacion` eran texto libre con default, y la invariante que
-- el resto del sistema da por cierta —`monto_bruto = monto_base +
-- recargo_monto`— vivía solo en TypeScript (`shared/lib/recargo-metodo.ts`) y
-- en un test. Con la policy de INSERT abierta, cualquier fila entraba: en la
-- prueba de tenancy del 5/9/2026 se insertó una con
-- `tipo_movimiento = 'CUALQUIER_COSA'` y `monto_bruto = 999999` contra
-- `monto_base = 100`.
--
-- VALIDADO ANTES DE APLICAR sobre las 1.170 filas vivas, con igualdad EXACTA
-- (no redondeada — la escala real de los montos es 2 en el 100% de las filas):
--   * 0 violan `monto_bruto = monto_base + recargo_monto`
--   * 0 violan `monto_neto = monto_bruto - comision_monto`
--   * 0 con `tipo_movimiento` fuera de los dos valores conocidos
--   * 0 con `estado_pago_operacion` fuera de CONFIRMADO / ANULADO
--   * 0 con montos negativos, 0 sin `negocio_id`
-- O sea que no había un bug de cálculo escondido: faltaba la constraint y nada
-- más. Si alguno de esos contadores hubiera dado > 0, esta migración no iba.
--
-- LO QUE NO SE PONE, a propósito:
--   * `monto_neto = monto_bruto - comision_monto`. Se cumple hoy en las 1.170
--     filas, pero es una decisión aparte: la dejo dicha acá para que se elija
--     con el dato a la vista en vez de agregarla de arrastre.
--   * `metodo_tipo IN (...)`. Es una copia congelada de `metodos_pago.tipo`;
--     un CHECK acá haría que agregar un tipo nuevo al catálogo rompa las
--     ventas antes de que nadie lo note. El vocabulario tiene que salir de la
--     tabla padre, no de una constraint duplicada.
--
-- NOT VALID + VALIDATE por separado no hace falta con 1.170 filas: el ADD
-- CHECK toma un ACCESS EXCLUSIVE cortito y la tabla es chica. En una tabla
-- grande esto se haría en dos pasos.
-- ---------------------------------------------------------------------------
alter table public.venta_pagos
  add constraint venta_pagos_tipo_movimiento_check
  check (tipo_movimiento in ('PAGO_VENTA', 'PAGO_CUENTA_CORRIENTE'));

alter table public.venta_pagos
  add constraint venta_pagos_estado_pago_operacion_check
  check (estado_pago_operacion in ('CONFIRMADO', 'ANULADO'));

-- La invariante del recargo. `monto_base` es lo que imputa al ticket o a la
-- deuda; `recargo_monto` es lo que se le suma por el medio; `monto_bruto` es
-- lo que pasa por el posnet. Que las tres cierren es lo que hace que la deuda
-- de cuenta corriente baje por base y nunca por bruto.
alter table public.venta_pagos
  add constraint venta_pagos_bruto_es_base_mas_recargo
  check (monto_bruto = monto_base + recargo_monto);

comment on constraint venta_pagos_bruto_es_base_mas_recargo on public.venta_pagos is
  'monto_bruto = monto_base + recargo_monto. El cálculo vive en shared/lib/recargo-metodo.ts; esto es el espejo en la base para que no dependa de que el caller se acuerde.';

-- Guard: que las tres hayan quedado.
do $$
declare v_faltan int;
begin
  select 3 - count(*) into v_faltan from pg_constraint
   where conrelid = 'public.venta_pagos'::regclass and contype = 'c'
     and conname in ('venta_pagos_tipo_movimiento_check',
                     'venta_pagos_estado_pago_operacion_check',
                     'venta_pagos_bruto_es_base_mas_recargo');
  if v_faltan <> 0 then
    raise exception 'Faltan % CHECK en venta_pagos.', v_faltan;
  end if;
end $$;
