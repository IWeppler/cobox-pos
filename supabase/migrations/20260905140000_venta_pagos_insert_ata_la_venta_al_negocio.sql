-- ---------------------------------------------------------------------------
-- venta_pagos: el INSERT deja de aceptar pagos sobre ventas de otro negocio.
--
-- EL AGUJERO. La policy de INSERT era `with check (true)`. La RESTRICTIVE
-- `aislamiento_negocio` obliga a que `negocio_id` sea el propio, pero NO dice
-- nada sobre `venta_id`: nada ataba la fila a una venta del mismo comercio.
--
-- VERIFICADO CONTRA PRODUCCIÓN, no leyendo `pg_policies`: con la publishable
-- key y una sesión real (magic link) del ADMIN de Kiosco Demo se insertó un
-- `venta_pagos` apuntando a una venta de Nombre de Prueba2. La fila se creó y
-- se borró después. Leer la venta ajena y leer pagos ajenos SÍ estaban
-- bloqueados; forzar `negocio_id` ajeno también (42501). Lo único abierto era
-- este INSERT.
--
-- POR QUÉ IMPORTA, que no es lo que parece. La fila insertada lleva el
-- `negocio_id` del ATACANTE, así que no aparece en la caja de la víctima: le
-- aparece al atacante, y para la víctima es invisible (RLS) e imborrable (no
-- hay policy de DELETE). El daño está en `registrar_devolucion`, que es
-- SECURITY DEFINER y por lo tanto NO pasa por RLS:
--
--     select count(*) into v_cobros from public.venta_pagos
--      where venta_id = p_venta_id and tipo_movimiento = 'PAGO_VENTA';
--     if v_cobros <> 1 then raise exception 'VENTA_CON_PAGO_MIXTO'; end if;
--     select * into v_pago from public.venta_pagos where venta_id = ...
--
-- Con un cobro fantasma agregado desde afuera, esa venta queda SIN PODER
-- DEVOLVERSE para siempre; y si la venta atacada no tenía cobros, `v_pago`
-- pasa a ser la fila del atacante y la devolución se emite con su método y su
-- monto. `anular_venta` en cambio es INVOKER: la fila ajena le es invisible y
-- la anulación no se ve afectada.
--
-- CÓMO SE CIERRA. El `with check` exige que la venta referenciada sea VISIBLE
-- para quien inserta. No hace falta comparar `negocio_id` a mano: `ventas` ya
-- tiene su RLS, y una subconsulta dentro de una policy la respeta, así que una
-- venta de otro comercio simplemente no existe para el atacante. Mismo patrón
-- que ya usaba `venta_pagos_update_de_venta_propia_o_admin`.
--
-- LOS COBROS DE CUENTA CORRIENTE VAN SIN `venta_id` (257 filas hoy) y tienen
-- que seguir entrando: para esos se exige que el CLIENTE sea visible, que es
-- la misma idea. Una fila sin venta y sin cliente queda permitida — hoy no
-- existe ninguna, y cerrarla es una decisión de forma, no de tenancy.
--
-- NO CIERRA el agujero de `registrar_devolucion` en sí: esa función sigue
-- leyendo `venta_pagos` sin filtrar `negocio_id`. Lo correcto es agregarle el
-- filtro, pero eso toca el camino de la plata y va aparte, con su smoke test.
-- Esta migración le saca la única vía de entrada conocida.
-- ---------------------------------------------------------------------------
drop policy if exists "Permitir insert a usuarios autenticados" on public.venta_pagos;

create policy venta_pagos_insert_de_venta_propia on public.venta_pagos
  for insert to authenticated
  with check (
    case
      when venta_id is not null
        then exists (select 1 from public.ventas v where v.id = venta_id)
      when cliente_id is not null
        then exists (select 1 from public.clientes c where c.id = cliente_id)
      else true
    end
  );

-- Guard: que no quede ninguna policy de INSERT con `true` a secas.
do $$
declare v_malas int;
begin
  select count(*) into v_malas from pg_policies
   where schemaname='public' and tablename='venta_pagos' and cmd='INSERT'
     and permissive='PERMISSIVE' and btrim(coalesce(with_check,'true'))='true';
  if v_malas > 0 then
    raise exception 'venta_pagos quedó con % policy de INSERT abierta.', v_malas;
  end if;
end $$;
