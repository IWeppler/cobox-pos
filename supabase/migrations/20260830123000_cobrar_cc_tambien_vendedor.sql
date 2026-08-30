-- Corrección de la migración anterior (20260830120000), medida antes de que
-- llegara a producción rota.
--
-- Ahí el permiso `clientes.cobrar_cc` se otorgó a los roles que tienen
-- `clientes.ver_modulo` (ADMIN y ENCARGADO), asumiendo que ese era el único
-- camino al botón de cobro. No lo es: el ítem "Clientes" del sidebar NO está
-- gateado por ese permiso, así que cualquier rol entra a la ficha y cobra.
--
-- Y no es hipotético. En Evens las VENDEDORAS ya cobran cuenta corriente:
-- 37 movimientos con pago_id escritos por 4 usuarias de rol VENDEDOR, el
-- último el 24/8/2026. Con el permiso otorgado solo a ADMIN/ENCARGADO, el
-- chequeo nuevo dentro de `registrarPagoDeudaAction` les cortaba el cobro en
-- el mostrador — plata real, todos los días.
--
-- Entonces se otorga a TODOS los roles de todos los negocios: la regla es la
-- misma de siempre, un permiso nuevo no le saca capacidad a nadie. El valor
-- del permiso no está en restringir de entrada sino en que ahora SE PUEDE
-- restringir desde Empleados y Permisos, y en que el server action dejó de ser
-- un endpoint abierto.

insert into public.rol_permisos (rol_id, permiso_id, negocio_id)
select r.id, p.id, r.negocio_id
  from public.roles r
 cross join (
   select id from public.permisos where clave = 'clientes.cobrar_cc'
 ) as p
 where r.negocio_id is not null
on conflict (rol_id, permiso_id) do nothing;
