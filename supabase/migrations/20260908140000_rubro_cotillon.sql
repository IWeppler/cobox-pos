-- ---------------------------------------------------------------------------
-- Rubro operativo COTILLÓN.
--
-- POR QUÉ. El Nono Cacho se dio de alta el 21/8/2026 y en la lista de rubros
-- no había cotillón, así que eligió "Otro" — que es lo único que le quedaba.
-- El operativo terminó en `indumentaria` (el fail-safe de `rubroOperativoDesde`
-- y `RUBRO_DEFAULT`), o sea que un cotillón recibió la plantilla de una tienda
-- de ropa, con columnas de talle y género, y en /admincomerz figura como
-- indumentaria.
--
-- QUÉ APORTA que no tenga ninguno de los siete anteriores:
--
--   * COLOR como columna de variante. El mismo globo, la misma servilleta y el
--     mismo plato existen en ocho colores, y la clienta pide "doce globos
--     rojos". Sin eso, cada color es un producto suelto: `quioscos` —el rubro
--     más parecido— no lo tiene.
--   * UNIDAD DE MEDIDA junto al peso. En el mismo mostrador se cobra una piñata
--     por unidad y confites por kilo. La capacidad de vender fraccionado es del
--     PRODUCTO (`productos.unidad_medida`, ver `shared/lib/unidad-venta.ts`),
--     no del comercio ni del rubro; la columna de la plantilla es donde se
--     declara al ingresar la mercadería.
--
-- Es un cambio ADITIVO: agrega un valor al CHECK y no toca ninguna fila
-- existente. Los otros siete rubros siguen exactamente igual.
--
-- El espejo en TypeScript es `Rubro` / `RUBROS_VALIDOS` en
-- `entities/config/types.ts`, más los cuatro mapas exhaustivos que el
-- compilador obliga a completar (columnas, etiquetas, defaults fiscales,
-- términos de categoría). Si acá se agrega un valor y allá no, el código lo
-- lee como `indumentaria` por el fail-closed de `normalizarRubro`.
-- ---------------------------------------------------------------------------

alter table public.configuracion_pos
  drop constraint if exists configuracion_pos_rubro_check;

alter table public.configuracion_pos
  add constraint configuracion_pos_rubro_check
  check (rubro = any (array[
    'indumentaria'::text,
    'electro'::text,
    'alimentos'::text,
    'farmacia'::text,
    'ferreteria'::text,
    'quioscos'::text,
    'cotillon'::text,
    'otros'::text
  ]));

-- El Nono Cacho: el comercio que motivó el rubro. Se corrige el operativo y
-- también el comercial, que había quedado en 'otro' por la misma razón.
update public.negocios
set rubro_comercial = 'cotillon'
where slug = 'el-nono-cacho'
  and rubro_comercial = 'otro';

update public.configuracion_pos
set rubro = 'cotillon'
where negocio_id = (select id from public.negocios where slug = 'el-nono-cacho');

-- ---------------------------------------------------------------------------
-- Guard: que el CHECK y el comercio queden como se espera.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def text;
  v_rubro text;
begin
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'configuracion_pos'
    and con.conname = 'configuracion_pos_rubro_check';

  if v_def is null or position('cotillon' in v_def) = 0 then
    raise exception 'el CHECK de configuracion_pos.rubro no acepta cotillon';
  end if;

  -- Los siete que ya existían tienen que seguir aceptados: reescribir un CHECK
  -- es justo donde se pierde un valor sin que nadie se entere.
  if position('quioscos' in v_def) = 0
     or position('ferreteria' in v_def) = 0
     or position('farmacia' in v_def) = 0
     or position('alimentos' in v_def) = 0
     or position('electro' in v_def) = 0
     or position('indumentaria' in v_def) = 0
     or position('otros' in v_def) = 0 then
    raise exception 'el CHECK de configuracion_pos.rubro perdio un rubro previo: %', v_def;
  end if;

  select cp.rubro into v_rubro
  from public.configuracion_pos cp
  join public.negocios ne on ne.id = cp.negocio_id
  where ne.slug = 'el-nono-cacho';

  if v_rubro is distinct from 'cotillon' then
    raise exception 'El Nono Cacho quedo en rubro %, se esperaba cotillon', v_rubro;
  end if;
end;
$do$;
