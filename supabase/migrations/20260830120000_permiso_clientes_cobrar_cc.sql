-- Permiso propio para cobrar cuenta corriente.
--
-- `registrarPagoDeudaAction` no chequeaba ningún permiso: se apoyaba en que su
-- único botón vivía en la ficha del cliente, y a /clientes se entra con
-- `clientes.ver_modulo`. Al agregar el cobro al POS —donde está parada la
-- vendedora cuando la clienta viene a pagar— esa protección por ubicación
-- desaparece, y un server action es un endpoint: el botón escondido no es
-- control de acceso.
--
-- Se otorga a los roles que HOY tienen `clientes.ver_modulo`, o sea los que ya
-- llegaban al botón de la ficha (ADMIN en los 7 negocios, ENCARGADO en 3).
-- Nadie gana ni pierde capacidad con esta migración: lo que cambia es que
-- ahora se puede DAR a un VENDEDOR desde Empleados y Permisos sin darle el
-- módulo de clientes entero, que es justo lo que pide el cobro en el POS.
--
-- Los negocios que se creen después lo reciben solos: crear_negocio_con_owner
-- le da al ADMIN nuevo TODAS las filas de `permisos`.

insert into public.permisos (clave, modulo, descripcion)
values (
  'clientes.cobrar_cc',
  'clientes',
  'Registrar el cobro de un saldo de cuenta corriente'
)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol_id, permiso_id, negocio_id)
select rp.rol_id, nuevo.id, rp.negocio_id
  from public.rol_permisos rp
  join public.permisos actual
    on actual.id = rp.permiso_id
   and actual.clave = 'clientes.ver_modulo'
 cross join (
   select id from public.permisos where clave = 'clientes.cobrar_cc'
 ) as nuevo
on conflict (rol_id, permiso_id) do nothing;
