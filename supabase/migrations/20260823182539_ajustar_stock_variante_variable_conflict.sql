-- ---------------------------------------------------------------------------
-- `ajustar_stock_variante`: `#variable_conflict use_column`.
--
-- Esta migración existe porque `20260823182514` se aplicó SIN la directiva y
-- dejó la función rota: al pasar de `language sql` a plpgsql, los nombres de
-- salida `id` y `stock` (que son OUT params) empezaron a sombrear las columnas
-- homónimas de `producto_variantes`, y `set stock = stock + p_delta` se volvió
--
--   ERROR: 42702: column reference "stock" is ambiguous
--
-- o sea que TODA venta que descontara stock se caía. Se detectó en el smoke
-- test inmediato y se arregló en el momento.
--
-- El archivo de `20260823182514` quedó corregido, así que reconstruir el
-- schema desde cero nunca pasa por el estado roto. Esta migración se mantiene
-- igual para que el repo y lo aplicado en producción digan lo mismo, y es un
-- `create or replace` con el mismo cuerpo: correrla después de la anterior no
-- cambia nada.
--
-- Los nombres `id` y `stock` NO se renombran: son el contrato que lee el
-- cliente (`descontado[0].stock` en el POS y en Carga Rápida).
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_stock_variante(
  p_variante_id       uuid,
  p_delta             numeric,
  p_permitir_negativo boolean default false,
  p_origen            text    default null,
  p_referencia_id     uuid    default null
)
returns table (id uuid, stock numeric)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_origen is not null then
    perform public.marcar_origen_movimiento(p_origen, p_referencia_id);
  end if;

  return query
  update public.producto_variantes
     set stock = producto_variantes.stock + p_delta
   where producto_variantes.id = p_variante_id
     and (p_permitir_negativo or producto_variantes.stock + p_delta >= 0)
  returning producto_variantes.id, producto_variantes.stock;
end;
$$;

revoke all on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) from public;
grant execute on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) to authenticated;
