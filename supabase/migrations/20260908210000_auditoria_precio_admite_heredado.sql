-- ============================================================================
-- LA AUDITORÍA DE PRECIOS TIENE QUE PODER DECIR "NO TENÍA PRECIO PROPIO"
-- ============================================================================
--
-- `actualizaciones_precio_items` guarda el valor anterior y el nuevo de cada
-- producto y de cada variante que un ajuste tocó, y de ahí sale el "Deshacer"
-- del historial de precios. Las cuatro columnas eran NOT NULL con default 0.
--
-- POR QUÉ AHORA MOLESTA. Después de 20260908200000 el estado normal de una
-- variante es NO tener precio propio: 5.835 de 5.926 heredan del producto. Con
-- las columnas NOT NULL, "heredaba" y "valía cero" se guardan igual —los dos
-- como 0— y son cosas distintas: heredar significa seguir al producto, y cero
-- significa que se vende a cero. Deshacer un ajuste sobre una variante que
-- heredaba le escribiría 0, y `variante.precio ?? producto.precio` devuelve
-- ese 0: el producto pasaría a venderse a $0 sin que nadie toque un precio.
--
-- Con la columna nullable, deshacer restaura exactamente lo que había,
-- incluido "no había nada".
--
-- LAS FILAS VIEJAS NO SE TOCAN. Un 0 escrito antes de hoy sigue siendo
-- ambiguo y no hay forma de desambiguarlo hacia atrás: el valor previo real no
-- está guardado en ningún otro lado. Se deja como está y el COMMENT lo dice.
-- De acá en adelante NULL es "no tenía valor propio" y 0 es "valía cero".
--
-- Es un cambio ADITIVO: aflojar un NOT NULL no invalida ninguna fila existente
-- ni ninguna consulta que ya las lea.
-- ============================================================================

alter table public.actualizaciones_precio_items
  alter column precio_anterior drop not null,
  alter column precio_nuevo    drop not null,
  alter column costo_anterior  drop not null,
  alter column costo_nuevo     drop not null;

-- Los defaults se van con el NOT NULL: con default 0 seguiría entrando un cero
-- cada vez que el que escribe omite la columna, que es exactamente la
-- ambigüedad que esta migración saca del medio.
alter table public.actualizaciones_precio_items
  alter column precio_anterior drop default,
  alter column precio_nuevo    drop default,
  alter column costo_anterior  drop default,
  alter column costo_nuevo     drop default;

comment on column public.actualizaciones_precio_items.precio_anterior is
  'Precio antes del ajuste. NULL = la variante no tenía precio propio (heredaba del producto); 0 = valía cero. Las filas anteriores a 20260908210000 guardan 0 en los dos casos y no se pueden desambiguar.';
comment on column public.actualizaciones_precio_items.precio_nuevo is
  'Precio después del ajuste. NULL = quedó heredando del producto. Ver precio_anterior.';
comment on column public.actualizaciones_precio_items.costo_anterior is
  'Costo antes del ajuste. NULL = la variante no tenía costo propio. Ver precio_anterior.';
comment on column public.actualizaciones_precio_items.costo_nuevo is
  'Costo después del ajuste. NULL = quedó heredando del producto. Ver precio_anterior.';

do $$
declare
  v_not_null integer;
begin
  select count(*)
    into v_not_null
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'actualizaciones_precio_items'
    and column_name in ('precio_anterior', 'precio_nuevo', 'costo_anterior', 'costo_nuevo')
    and (is_nullable = 'NO' or column_default is not null);

  if v_not_null > 0 then
    raise exception
      'GUARD: quedaron % columnas de la auditoria de precios sin poder expresar "heredado"', v_not_null;
  end if;
end $$;

-- ============================================================================
-- Y la RPC del remito deja de aplastar el NULL contra cero.
--
-- `aprobar_orden_compra_impl` (20260908190000) escribía las filas de auditoría
-- con `coalesce(..., 0)` porque las columnas no aceptaban otra cosa. Una
-- variante alineada por precio pero SIN costo propio quedaba auditada con
-- costo 0, y deshacer ese lote le escribía 0 al costo: el margen de todo lo
-- que se vendiera después salía inflado, sin ningún error a la vista.
--
-- Desde el cuerpo VIVO, con las dos anclas verificadas únicas — mismo criterio
-- que 20260908190000.
-- ============================================================================
do $$
declare
  v_def text;
  v_ancla text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'aprobar_orden_compra_impl';

  if v_def is null then
    raise exception 'GUARD: no existe public.aprobar_orden_compra_impl';
  end if;

  -- Fila del PRODUCTO.
  v_ancla :=
'            coalesce(v_costo_viejo, 0), coalesce(v_costo_final, 0),
            coalesce(v_precio_viejo, 0), coalesce(v_precio_final, 0)';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla de la fila de producto no aparece exactamente una vez';
  end if;

  v_nuevo :=
'            v_costo_viejo, v_costo_final,
            v_precio_viejo, v_precio_final';
  v_def := replace(v_def, v_ancla, v_nuevo);

  -- Filas de las VARIANTES. El `case` sobre un valor NULL ya cae al else y
  -- devuelve NULL, que es lo que hay que guardar.
  v_ancla :=
'            coalesce(pv.costo, 0),
            coalesce(case when pv.costo = v_costo_efectivo then v_costo_final else pv.costo end, 0),
            coalesce(pv.precio, 0),
            coalesce(case when pv.precio = v_precio_efectivo then v_precio_final else pv.precio end, 0)';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'GUARD: el ancla de las filas de variante no aparece exactamente una vez';
  end if;

  v_nuevo :=
'            pv.costo,
            case when pv.costo = v_costo_efectivo then v_costo_final else pv.costo end,
            pv.precio,
            case when pv.precio = v_precio_efectivo then v_precio_final else pv.precio end';
  v_def := replace(v_def, v_ancla, v_nuevo);

  execute v_def;
end $$;

do $guard$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'aprobar_orden_compra_impl';

  if position('coalesce(pv.precio, 0)' in v_def) > 0
     or position('coalesce(v_precio_viejo, 0)' in v_def) > 0 then
    raise exception 'GUARD: la RPC del remito sigue aplastando el NULL contra cero';
  end if;
  if position('unidades_serie' in v_def) = 0 then
    raise exception 'GUARD: el reemplazo se llevo puesta la creacion de unidades_serie';
  end if;
end $guard$;
