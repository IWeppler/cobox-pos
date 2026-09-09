-- ============================================================================
-- LAS VARIANTES VUELVEN A HEREDAR EL PRECIO DEL PRODUCTO
-- ============================================================================
--
-- `producto_variantes.precio` en NULL significa "el precio es el del
-- producto": el POS, el catálogo público y create-sale resuelven todos la
-- misma cascada, `variante.precio ?? producto.precio` (y `variante.costo`
-- contra `productos.precio_costo`, create-sale.ts:376).
--
-- EL PROBLEMA. 1.252 variantes tienen guardado un precio que es EXACTAMENTE el
-- del producto. No son un precio especial: son el mismo número escrito dos
-- veces. Mientras nadie toca nada da igual — pero en cuanto el precio del
-- producto cambia, la copia se queda con el viejo y pasa a ser la que manda en
-- la caja. Eso es lo que le pasó a Evens con "Pantalon sastrero HHP": $52.000
-- en /stock y $20.000 en el mostrador (ver 20260908180000 y 20260908190000).
--
-- Y no es una anécdota vieja: la dueña va a corregir el precio donde lo lee,
-- que es el del producto, y se va a ir convencida de que lo arregló.
--
-- DE DÓNDE SALEN LAS COPIAS. De un solo lugar: `aplicarPreciosAction`, la
-- actualización masiva de precios, que escribe el producto y después COPIA el
-- precio a todas sus variantes, convirtiendo herederas en copias. Medido:
-- Estilo Bonito corrió 5 lotes en julio (3.605 filas de variante) y tiene
-- 1.142 copias sobre 1.514 variantes, el 75%. Evens corrió 5 lotes también,
-- pero anteriores a que esa función escribiera variantes, y tiene 108. Ninja
-- Camisetas y ClickTostado nunca corrieron uno: cero copias en 687 variantes.
-- Los tres caminos de alta y edición ya escriben NULL cuando el precio
-- coincide con el del padre, y el remito también. Esa fábrica se apaga en el
-- mismo commit que esta migración.
--
-- POR QUÉ ES SEGURO. Nulear una copia NO cambia un solo precio, y eso es
-- demostrable, no una expectativa: si `pv.precio = p.precio`, entonces
-- `pv.precio ?? p.precio` da el mismo número antes y después. La migración lo
-- verifica de verdad — guarda el precio efectivo de las 5.926 variantes antes
-- de tocar nada y compara contra el de después. Si hay una sola diferencia,
-- aborta.
--
-- LO QUE QUEDA: 69 variantes con precio propio DISTINTO en todo el SaaS, el
-- 1,2%. Ese es el tamaño real de la feature "precio por variante", y no se
-- toca: incluye casos legítimos como "Maní con Sal" de Kiosco Demo a $1.800 /
-- $3.900 / $7.200, que son tres pesos del mismo producto.
--
-- EFECTO SECUNDARIO ESPERADO: 1.252 filas cambian `updated_at`, así que la
-- sincronización incremental (`catalogo-delta.ts`) se las va a llevar a los
-- dispositivos. No hace falta avisar de recargar el POS, a diferencia del
-- renombre masivo del 5/9: acá ningún `nombre_display` cambia y ningún precio
-- efectivo cambia, así que un catálogo viejo y uno nuevo venden igual.
-- ============================================================================

create temporary table _precio_efectivo_antes on commit drop as
select
  pv.id as variante_id,
  case when pv.precio is not null then pv.precio else p.precio end as precio,
  case when pv.costo  is not null then pv.costo  else p.precio_costo end as costo
from public.producto_variantes pv
join public.productos p on p.id = pv.producto_id;

-- El precio y el costo son independientes: una variante puede tener el precio
-- copiado y un costo propio de verdad. Dos statements, dos condiciones.
update public.producto_variantes pv
set precio = null
from public.productos p
where p.id = pv.producto_id
  and pv.precio is not null
  and pv.precio = p.precio;

update public.producto_variantes pv
set costo = null
from public.productos p
where p.id = pv.producto_id
  and pv.costo is not null
  and pv.costo = p.precio_costo;

do $$
declare
  v_difieren integer;
  v_detalle text;
  v_quedan integer;
begin
  select count(*), string_agg(variante_id::text, ', ')
    into v_difieren, v_detalle
  from (
    select a.variante_id
    from _precio_efectivo_antes a
    join public.producto_variantes pv on pv.id = a.variante_id
    join public.productos p on p.id = pv.producto_id
    where (case when pv.precio is not null then pv.precio else p.precio end)
            is distinct from a.precio
       or (case when pv.costo is not null then pv.costo else p.precio_costo end)
            is distinct from a.costo
    limit 20
  ) d;

  if v_difieren > 0 then
    raise exception
      'GUARD: la normalizacion cambio el precio efectivo de % variante(s): %',
      v_difieren, v_detalle;
  end if;

  -- Lo que tiene que quedar: cero copias exactas. Si queda alguna, el UPDATE
  -- no cubrio un caso y este archivo esta mintiendo sobre lo que hizo.
  select count(*)
    into v_quedan
  from public.producto_variantes pv
  join public.productos p on p.id = pv.producto_id
  where (pv.precio is not null and pv.precio = p.precio)
     or (pv.costo is not null and pv.costo = p.precio_costo);

  if v_quedan > 0 then
    raise exception 'GUARD: quedaron % copias exactas sin nulear', v_quedan;
  end if;
end $$;
