-- ---------------------------------------------------------------------------
-- Estilo Bonito: elimina el atributo "2", que es basura de importación.
--
-- QUÉ ES. Una propiedad llamada literalmente "2", con valores 1..9 y 178 de
-- sus 225 variantes en el valor "1": la forma exacta de un índice de fila o de
-- columna que un parser filtró al JSONB de atributos. `diagnostico-atributo-2`
-- juntó la evidencia en su momento y dejó la decisión abierta; la decisión es
-- borrarlo. No lo usa ninguna categoría (`categoria_atributos` no lo
-- referencia) y no significa nada para nadie en el mostrador.
--
-- POR QUÉ IMPORTA MÁS QUE LA PROLIJIDAD: un atributo fantasma PARTE VARIANTES.
-- Dos prendas idénticas quedan como dos variantes distintas si el import les
-- puso "1" y "2", y eso ensucia el stock, el match de remitos y cualquier
-- señal por producto.
--
-- LO QUE SE VERIFICÓ ANTES DE ESCRIBIR (todo en cero):
--   * 0 grupos colisionan: sacando la clave "2" no queda NINGUNA variante
--     duplicada dentro de su producto. Era el riesgo real — dos filas
--     indistinguibles con stock separado — y no existe.
--   * 0 recortes fallidos de `nombre_display`: las 225 caen en dos formatos
--     ("2: X / ..." y "X / ...", siempre con el valor al principio).
--   * 0 colisiones del nombre recortado, ni contra otras variantes ni contra
--     el espejo `productos_stock`.
--   * 0 renglones de venta atados al nombre: los 33 que tocan estas variantes
--     tienen `variante_id`, así que la anulación no depende del texto.
--
-- EL ESPEJO LEGACY VA EN EL MISMO MOVIMIENTO. `productos_stock.variante`
-- guarda el `nombre_display` como TEXTO, y `create-sale` busca el stock por
-- `producto_id | variante`. Cambiar el nombre de la variante sin renombrar el
-- espejo dejaría 223 variantes que no se pueden vender ("Error de stock en
-- ..."). Por eso el espejo se actualiza PRIMERO, mientras el nombre viejo
-- todavía sirve para emparejar.
--
-- REVERSIBLE. Todo lo que se borra o se pisa queda en
-- `respaldos.atributo_2_estilo_bonito` antes de tocarlo, con el nombre_display
-- original de cada variante. El esquema `respaldos` no se expone por
-- PostgREST (no está en el search_path de la API) y no tiene grants para anon
-- ni authenticated: es para reconstruir a mano, no para que lo lea la app.
--
-- IDEMPOTENTE: si el atributo ya no está, no hace nada.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.atributo_2_estilo_bonito (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  tipo      text not null,
  fila      jsonb not null
);

-- El recorte del nombre visible, como función temporal: la usan el espejo y
-- la variante, y las dos tienen que cortar EXACTAMENTE igual. Dos formatos,
-- los únicos dos que existen en los datos:
--   "2: 1 / MARCA: lukytas / TALLE: 2"  ->  "MARCA: lukytas / TALLE: 2"
--   "1 / Azul / Bingo fuel / 10"        ->  "Azul / Bingo fuel / 10"
-- Cualquier otra forma se devuelve intacta: preferimos un nombre con basura a
-- un nombre cortado por una regla que no lo contemplaba.
create or replace function public.recortar_valor_atributo_2(p_nombre text, p_valor text)
returns text
language sql
immutable
as $fn$
  select case
    when p_nombre like '2: %'
      then regexp_replace(p_nombre, '^2: [^/]*/ ?', '')
    when p_valor is not null and p_nombre like p_valor || ' / %'
      then substr(p_nombre, length(p_valor) + 4)
    else p_nombre
  end;
$fn$;

do $$
declare
  v_negocio  uuid := '055a0286-a7ff-46f4-9910-ba4941140db6';
  v_atributo uuid;
begin
  select a.id into v_atributo
    from public.atributos a
   where a.negocio_id = v_negocio and a.nombre = '2';

  if v_atributo is null then
    raise notice 'El atributo "2" de Estilo Bonito ya no existe: nada que hacer.';
    return;
  end if;

  -- 1. RESPALDO de todo lo que se va a tocar.
  insert into respaldos.atributo_2_estilo_bonito (tipo, fila)
  select 'atributo', to_jsonb(a) from public.atributos a where a.id = v_atributo;

  insert into respaldos.atributo_2_estilo_bonito (tipo, fila)
  select 'atributo_valor', to_jsonb(av)
    from public.atributo_valores av where av.atributo_id = v_atributo;

  insert into respaldos.atributo_2_estilo_bonito (tipo, fila)
  select 'relacion', to_jsonb(pvv)
    from public.producto_variante_valores pvv
   where pvv.atributo_id = v_atributo;

  insert into respaldos.atributo_2_estilo_bonito (tipo, fila)
  select 'variante', jsonb_build_object(
           'id', v.id, 'producto_id', v.producto_id,
           'nombre_display', v.nombre_display, 'atributos', v.atributos)
    from public.producto_variantes v
   where v.negocio_id = v_negocio and v.atributos ? '2';

  insert into respaldos.atributo_2_estilo_bonito (tipo, fila)
  select 'espejo_legacy', jsonb_build_object(
           'id', ps.id, 'producto_id', ps.producto_id, 'variante', ps.variante)
    from public.productos_stock ps
    join public.producto_variantes v
      on v.producto_id = ps.producto_id and v.nombre_display = ps.variante
   where v.negocio_id = v_negocio and v.atributos ? '2';

  -- 2. El espejo legacy, ANTES de que el nombre cambie (ver encabezado).
  update public.productos_stock ps
     set variante = nuevo.nombre
    from (
      select v.producto_id, v.nombre_display as viejo,
             public.recortar_valor_atributo_2(v.nombre_display, v.atributos->>'2') as nombre
        from public.producto_variantes v
       where v.negocio_id = v_negocio and v.atributos ? '2'
    ) nuevo
   where ps.producto_id = nuevo.producto_id
     and ps.variante = nuevo.viejo;

  -- 3. La variante: fuera la clave del JSONB y fuera del nombre visible.
  update public.producto_variantes v
     set atributos = v.atributos - '2',
         nombre_display =
           public.recortar_valor_atributo_2(v.nombre_display, v.atributos->>'2'),
         updated_at = now()
   where v.negocio_id = v_negocio and v.atributos ? '2';

  -- 4. La relación normalizada y el catálogo del atributo.
  delete from public.producto_variante_valores where atributo_id = v_atributo;
  delete from public.atributo_valores          where atributo_id = v_atributo;
  delete from public.atributos                 where id = v_atributo;
end $$;

drop function if exists public.recortar_valor_atributo_2(text, text);
