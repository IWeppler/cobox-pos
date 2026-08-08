-- Permiso propio para el import de planilla.
--
-- Hasta ahora las actions del import (preview y confirmar) no chequeaban
-- permiso: se apoyaban en que el botón solo se le muestra a un ADMIN. Un
-- server action es un endpoint, y el botón escondido no es un control de
-- acceso — cualquiera con sesión podía llamarlo.
--
-- Se agrega `stock.importar_planilla` en vez de reusar
-- `stock.ingresar_remito` porque son los dos flujos hermanos por rubro
-- (indumentaria entra por remito, electro por planilla) y un comercio tiene
-- que poder dar uno sin dar el otro. Se otorga a los mismos roles que hoy
-- tienen el de remito: quien puede ingresar mercadería por un camino puede
-- por el otro, así que nadie gana capacidad que no tuviera.
--
-- Los negocios que se creen después lo reciben solos: crear_negocio_con_owner
-- le da al ADMIN nuevo TODAS las filas de `permisos`.

insert into public.permisos (clave, modulo, descripcion)
values (
  'stock.importar_planilla',
  'stock',
  'Importar productos y stock de forma masiva desde una planilla CSV/XLSX'
)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol_id, permiso_id, negocio_id)
select rp.rol_id, nuevo.id, rp.negocio_id
  from public.rol_permisos rp
  join public.permisos actual
    on actual.id = rp.permiso_id
   and actual.clave = 'stock.ingresar_remito'
 cross join (
   select id from public.permisos where clave = 'stock.importar_planilla'
 ) as nuevo
on conflict (rol_id, permiso_id) do nothing;
