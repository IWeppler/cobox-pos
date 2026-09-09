-- ============================================================================
-- EL PRECIO EFECTIVO DE UN PRODUCTO: EL QUE SE COBRA, NO EL DE LA CABECERA
-- ============================================================================
--
-- Un producto tiene DOS precios y hasta hoy nada decía cuál gana. `productos.
-- precio` es el de cabecera —lo que muestra /stock— y `producto_variantes.
-- precio` es el de cada variante. En la venta gana la variante:
-- `precioBaseDeVariante` es `variante.precio ?? producto.precio`, y lo mismo
-- hace el catálogo público.
--
-- Cuando los dos números difieren, /stock miente. Medido el 8/9/2026: 16
-- productos en Evens, 12 en Estilo Bonito y 2 en Kiosco Demo. El caso que lo
-- destapó es "Pantalon sastrero HHP" de Evens, que muestra $52.000 en el
-- listado y cobraría $20.000 en la caja.
--
-- CÓMO SE LLEGA A ESO. `aprobar_orden_compra_impl` escribe `productos.precio`
-- con el precio aprobado en la conciliación, pero sobre una variante que YA
-- existe solo hace `stock = stock + cantidad`: nunca le toca el precio. La
-- actualización masiva de precios (`update-prices.ts`) sí escribe los dos, por
-- eso la divergencia solo la produce el remito.
--
-- PARA QUÉ EXISTE ESTA VISTA. La conciliación calculaba el markup anterior de
-- un producto con `productos.precio`. En estos 30 productos ese número no es
-- el que se vende, así que el margen que decía "conservar" salía de un precio
-- que no existe. Con la vista, la pantalla compara contra lo que se cobra.
--
-- CUÁNDO HAY PRECIO EFECTIVO Y CUÁNDO NO. Solo cuando TODAS las variantes
-- tienen precio propio y todas dicen el mismo número. Si una variante lo tiene
-- y otra no, o si dicen números distintos, no hay "un" precio del producto: la
-- vista devuelve el de cabecera y marca `precios_dispares`, que es la verdad
-- —hay que mostrarlo, no promediarlo—. Un promedio o un mínimo inventarían un
-- precio que nadie fijó, que es justo el error que se está corrigiendo.
--
-- No es una tabla ni un campo nuevo: es una LECTURA. Duplicar el precio en una
-- columna materializada agregaría una tercera cosa que puede quedar vieja, y
-- el problema de este archivo es exactamente ese.
-- ============================================================================

create or replace view public.productos_precio_efectivo
with (security_invoker = on) as
select
  p.id,
  p.negocio_id,
  p.nombre,
  p.tipo,
  p.publicado,
  p.precio,
  p.precio_costo,
  -- `count(pv.precio)` no cuenta los NULL, así que `con_precio = total` es
  -- "todas tienen precio propio" y `precios_distintos = 1` es "todas dicen lo
  -- mismo". Las dos condiciones juntas, o se cae al de cabecera.
  case
    when v.total > 0 and v.con_precio = v.total and v.precios_distintos = 1
      then v.precio_unico
    else p.precio
  end as precio_efectivo,
  case
    when v.total > 0 and v.con_costo = v.total and v.costos_distintos = 1
      then v.costo_unico
    else p.precio_costo
  end as costo_efectivo,
  coalesce(v.con_precio, 0) as variantes_con_precio_propio,
  coalesce(v.total, 0) as variantes_totales,
  -- Las variantes no se ponen de acuerdo entre ellas: no hay un precio del
  -- producto que mostrar. Distinto de "difiere de la cabecera", que es un
  -- desacople resoluble.
  coalesce(v.total, 0) > 0
    and (v.precios_distintos > 1 or (v.con_precio > 0 and v.con_precio < v.total))
    as precios_dispares
from public.productos p
left join lateral (
  select
    count(*)                     as total,
    count(pv.precio)             as con_precio,
    count(distinct pv.precio)    as precios_distintos,
    min(pv.precio)               as precio_unico,
    count(pv.costo)              as con_costo,
    count(distinct pv.costo)     as costos_distintos,
    min(pv.costo)                as costo_unico
  from public.producto_variantes pv
  where pv.producto_id = p.id
) v on true;

comment on view public.productos_precio_efectivo is
  'El precio que realmente se cobra de cada producto: el de sus variantes cuando todas coinciden, el de cabecera si no. `precios_dispares` avisa que no hay un precio único que mostrar. Solo lectura; la escribe nadie. Ver 20260908180000.';

-- `security_invoker = on` hace que la RLS que corre sea la del que consulta,
-- no la del dueño de la vista. Sin eso, esta vista sería un agujero de
-- aislamiento entre negocios: devolvería el catálogo de los seis.
grant select on public.productos_precio_efectivo to authenticated;

-- anon NO. La vista expone `precio_costo` y `costo_efectivo`, que son el
-- margen del comercio — el mismo criterio que dejó `costo` fuera del catálogo
-- público en 20260811140000.
revoke all on public.productos_precio_efectivo from anon;

do $$
declare
  v_security_invoker boolean;
  v_anon_puede boolean;
begin
  -- Postgres guarda la opción como `security_invoker=on`, no `=true`; se
  -- aceptan las dos formas para que el guard no falle sobre una vista bien
  -- creada (pasó al escribirlo).
  select coalesce(
           (select option_value in ('on', 'true')
            from pg_options_to_table(c.reloptions)
            where option_name = 'security_invoker'),
           false)
    into v_security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'productos_precio_efectivo';

  if not coalesce(v_security_invoker, false) then
    raise exception
      'GUARD: productos_precio_efectivo quedó sin security_invoker; con la RLS del dueño devolvería el catálogo de todos los negocios';
  end if;

  select has_table_privilege('anon', 'public.productos_precio_efectivo', 'select')
    into v_anon_puede;

  if v_anon_puede then
    raise exception
      'GUARD: anon puede leer productos_precio_efectivo, que expone el costo';
  end if;
end $$;
