-- ---------------------------------------------------------------------------
-- Completa el backfill de `20260823180630` en las ventas con renglones de más
-- de una unidad.
--
-- EL ERROR: aquel backfill reconstruía el subtotal como `sum(precio_final)`,
-- dando por hecho que `ventas_items.precio_final` era el total del renglón.
-- No lo es: **es UNITARIO**. Verificado sobre las 12 ventas de Evens que
-- tienen alguna línea con cantidad > 1, comparando contra las columnas de la
-- cabecera, que sí son totales:
--
--   ventas.precio_costo = Σ (items.precio_costo × cantidad)   12 de 12
--   ventas.total        = Σ (items.precio_final × cantidad)    9 de 12
--                         (las otras 3 difieren por recargo de CC o de método,
--                          que no son mercadería)
--
-- Es la misma trampa que CLAUDE.md ya documentaba para la CABECERA —
-- `ventas.precio_costo` es el costo TOTAL— leída al revés un nivel más abajo.
-- A nivel RENGLÓN los dos son unitarios.
--
-- QUÉ PASÓ CON LOS DATOS: nada quedó mal escrito. El backfill solo escribía
-- donde la aritmética cerraba al peso, así que las ventas afectadas no
-- pasaron el test y quedaron en NULL. Las 7 ventas sin dato eran EXACTAMENTE
-- las 7 con líneas multi-unidad. El fail-closed hizo lo que tenía que hacer:
-- no saber es recuperable, un número inventado no.
--
-- El archivo de `20260823180630` quedó corregido, así que una reconstrucción
-- desde cero ya no deja esas 7 afuera; esta migración entonces no encuentra
-- nada que hacer y es un no-op. Se mantiene para que el repo y lo aplicado en
-- producción digan lo mismo.
--
-- Resultado en producción: 171 de 171 ventas fiadas resueltas, 0 sin dato.
-- El recargo registrado de Evens pasó de $657.075 a $695.325.
-- ---------------------------------------------------------------------------
with base as (
  select
    v.id,
    coalesce(c.cc_recargo_default, 0)                          as pct,
    coalesce(v.total, 0) - coalesce(v.recargo_metodo_total, 0) as sin_recargo_metodo,
    coalesce((select sum(i.precio_final * i.cantidad) from public.ventas_items i where i.venta_id = v.id), 0)
    - coalesce((select sum(d.monto_descontado)        from public.ventas_descuentos d where d.venta_id = v.id), 0)
                                                               as subtotal
  from public.ventas v
  join public.configuracion_pos c on c.negocio_id = v.negocio_id
  where coalesce(v.monto_pendiente, 0) > 0
    and v.recargo_cc_porcentaje is null
),
resuelto as (
  select
    id,
    case
      when pct > 0 and abs(subtotal * (1 + pct / 100.0) - sin_recargo_metodo) <= 1 then pct
      when abs(subtotal - sin_recargo_metodo) <= 1                                then 0
    end as pct_resuelto,
    subtotal
  from base
)
update public.ventas v
   set recargo_cc_porcentaje = r.pct_resuelto,
       recargo_cc_monto      = round(r.subtotal * r.pct_resuelto / 100.0, 2)
  from resuelto r
 where v.id = r.id
   and r.pct_resuelto is not null;

update public.cuenta_corriente_movimientos m
   set monto_recargo      = least(coalesce(v.recargo_cc_monto, 0), m.monto),
       recargo_porcentaje = v.recargo_cc_porcentaje
  from public.ventas v
 where v.id = m.venta_id
   and m.tipo = 'DEBITO'
   and m.recargo_porcentaje is null
   and v.recargo_cc_porcentaje is not null;
