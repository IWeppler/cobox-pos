-- Fusiona las variantes que comparten identidad dentro de un mismo producto.
--
-- POR QUÉ AHORA. Es el paso 0 de sacar el borrado+reinserción de
-- `guardar_variantes_producto`. La identidad estable de una variante es
-- `atributos_comparables(atributos)` acotada a (negocio_id, producto_id) — la
-- clave normalizada que ya existe desde 20260818140000 y que la propia RPC usa
-- para machear. Para que el upsert pueda decir "esta entrante ES esta
-- existente" no puede haber dos existentes con la misma clave: con dos, el
-- `LIMIT 1` del match elige una y la otra se queda sin match, o sea que el
-- guardado siguiente la borraría en silencio. Y no sería determinístico cuál.
--
-- CUÁNTAS SON. Una sola en las seis bases, sobre 5.747 variantes:
-- "CARGO IMPERMEABLE 2 EN 1", Azul / 42 / Hombre, en Evens. Las dos filas se
-- crearon con 114 MILISEGUNDOS de diferencia el 16/7/2026 — un doble submit,
-- no dos cargas distintas. El producto no tiene otras variantes: su única
-- combinación real está duplicada.
--
-- VA ESCRITA GENÉRICA Y NO CON LOS DOS UUID A MANO, por dos motivos. Uno, un
-- UUID hardcodeado que ya no existe (o que cambió de stock entre que se
-- escribió esto y que se aplica) hace lo incorrecto sin avisar. Dos, la misma
-- migración tiene que servir si aparece otro duplicado en otro negocio antes
-- de que se aplique: son cuatro comercios vivos y esto corre para los cuatro.
--
-- QUÉ FILA SOBREVIVE: la más vieja por `created_at`. Es la que acumuló
-- historial — en el caso real, la que tiene el renglón de venta.
--
-- EL STOCK SE SUMA, y la decisión importa. Hoy las dos filas tienen 1 unidad y
-- el POS muestra 2 para ese producto (`getTotalStock` suma las variantes). Si
-- la fusión se quedara con 1, la migración estaría descontando una unidad de
-- mercadería por su cuenta. Si la verdad física es 1 o 2 no lo puede saber una
-- migración: lo dice un conteo en el local. Sumar deja el total EXACTAMENTE
-- como está hoy, así que este cambio no mueve mercadería — que es la única
-- postura defendible cuando el dato de abajo es ambiguo.
--
-- POR ESO SE APAGA EL TRIGGER de `movimientos_stock`. No hubo movimiento: hay
-- las mismas unidades antes y después, en una fila en vez de dos. Con el
-- trigger suelto quedarían un +1 y un -1 con origen DESCONOCIDO que después
-- alguien tiene que interpretar. Mismo criterio que ya usa el wrapper de
-- `guardar_variantes_producto` para no escribir los ceros intermedios del
-- delete+reinsert. La huella del cambio queda en `variantes_fusionadas`, que
-- es donde corresponde.
--
-- REVERSIBLE. `variantes_fusionadas` guarda la fila eliminada entera y el id
-- de la sobreviviente. El rollback está en el archivo `_down` hermano.

begin;

-- El registro de la fusión, y la red para revertirla. Se queda en la base
-- después de aplicar: sin la fila vieja guardada, esta migración sería
-- irreversible, y es un borrado de datos en producción.
create table if not exists public.variantes_fusionadas (
  id                    uuid primary key default gen_random_uuid(),
  negocio_id            uuid not null,
  producto_id           uuid not null,
  clave                 text not null,
  variante_id_eliminada uuid not null,
  variante_id_sobrevive uuid not null,
  -- La fila borrada entera, para poder reinsertarla igual.
  fila_eliminada        jsonb not null,
  stock_antes_sobrevive numeric(12,3) not null,
  stock_despues         numeric(12,3) not null,
  fusionado_en          timestamptz not null default now()
);

comment on table public.variantes_fusionadas is
  'Variantes que compartían identidad (atributos_comparables) dentro de un producto y se unificaron en 20260902100000, paso previo al upsert de guardar_variantes_producto. Guarda la fila eliminada entera para poder revertir.';

-- Sin movimientos: la mercadería no se movió, cambió de fila. Ver encabezado.
select set_config('comerz.omitir_movimiento', 'on', true);

with grupos as (
  select
    negocio_id,
    producto_id,
    public.atributos_comparables(atributos) as clave,
    -- La más vieja sobrevive: es la que tiene el historial colgando.
    (array_agg(id order by created_at, id))[1] as sobrevive,
    sum(coalesce(stock, 0))                    as stock_total
  from public.producto_variantes
  group by negocio_id, producto_id, public.atributos_comparables(atributos)
  having count(*) > 1
),
perdedoras as (
  select g.*, v.id as eliminada, to_jsonb(v) as fila
  from grupos g
  join public.producto_variantes v
    on v.negocio_id  = g.negocio_id
   and v.producto_id = g.producto_id
   and public.atributos_comparables(v.atributos) = g.clave
   and v.id <> g.sobrevive
)
insert into public.variantes_fusionadas (
  negocio_id, producto_id, clave, variante_id_eliminada, variante_id_sobrevive,
  fila_eliminada, stock_antes_sobrevive, stock_despues
)
select
  p.negocio_id, p.producto_id, p.clave, p.eliminada, p.sobrevive,
  p.fila,
  (select coalesce(s.stock, 0) from public.producto_variantes s where s.id = p.sobrevive),
  p.stock_total
from perdedoras p;

-- 1. Repuntar TODO lo que referencia a la eliminada, antes de borrarla.
--
-- Las tres primeras no tienen FK, así que un borrado las dejaría apuntando a
-- un id muerto sin error — que es exactamente el problema que este trabajo
-- viene a arreglar. Las tres últimas sí tienen FK, y su ON DELETE haría cosas
-- peores: SET NULL desasocia el historial de precios, y CASCADE borraría
-- reservas y unidades con IMEI, que es mercadería física.
update public.ventas_items i
   set variante_id = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where i.variante_id = f.variante_id_eliminada;

update public.movimientos_stock m
   set variante_id = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where m.variante_id = f.variante_id_eliminada;

update public.producto_variantes_auditoria a
   set variante_id_anterior = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where a.variante_id_anterior = f.variante_id_eliminada;

update public.producto_variantes_auditoria a
   set variante_id_nueva = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where a.variante_id_nueva = f.variante_id_eliminada;

update public.actualizaciones_precio_items p
   set variante_id = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where p.variante_id = f.variante_id_eliminada;

update public.reservas r
   set variante_id = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where r.variante_id = f.variante_id_eliminada;

update public.unidades_serie u
   set producto_variante_id = f.variante_id_sobrevive
  from public.variantes_fusionadas f
 where u.producto_variante_id = f.variante_id_eliminada;

-- 2. La sobreviviente se queda con el stock del grupo entero.
update public.producto_variantes v
   set stock      = f.stock_despues,
       updated_at = now()
  from public.variantes_fusionadas f
 where v.id = f.variante_id_sobrevive;

-- 3. Recién ahora se borra. `producto_variante_valores` se va por CASCADE: son
--    la misma tripleta que las de la sobreviviente, no hay nada que conservar.
delete from public.producto_variantes v
 using public.variantes_fusionadas f
 where v.id = f.variante_id_eliminada;

select set_config('comerz.omitir_movimiento', '', true);

-- 4. Guard. Si después de esto todavía queda una clave repetida, el índice
--    único del paso 2 no va a poder crearse y el upsert del paso 1 elegiría
--    una fila al azar. Mejor fallar acá, con la transacción abierta.
do $$
declare
  v_repetidas int;
begin
  select count(*) into v_repetidas
    from (
      select 1
        from public.producto_variantes
       group by negocio_id, producto_id, public.atributos_comparables(atributos)
      having count(*) > 1
    ) t;

  if v_repetidas > 0 then
    raise exception
      'Quedan % grupos de variantes con identidad repetida; la fusión no cerró.',
      v_repetidas;
  end if;
end $$;

commit;
