-- Descontar stock deja marca de tiempo: `ajustar_stock_variante` y
-- `ajustar_stock_variantes_batch` pasan a escribir `updated_at`.
--
-- QUÉ PASABA. `producto_variantes.updated_at` existe desde el esquema maestro,
-- es NOT NULL DEFAULT now(), y NO tiene trigger: depende de que cada camino de
-- escritura la setee a mano. La venta —el evento que más mueve el stock— no lo
-- hacía. Medido antes de este cambio, en Evens: de 3.364 variantes, 3.355
-- (99,7%) tenían `updated_at` exactamente igual a `created_at`, mientras
-- `movimientos_stock` registraba 475 movimientos reales en 7 días sobre 413
-- variantes distintas.
--
-- O sea que la columna existía, siempre traía una fecha con pinta de válida, y
-- era mentira. Ese es el peor tipo de dato: uno que no se puede distinguir de
-- uno bueno.
--
-- POR QUÉ IMPORTA. Es el bloqueante nº1 del catálogo local con sincronización
-- incremental en /pos: un cliente que pregunte "¿qué cambió desde la última
-- vez?" mirando `updated_at` NO vería ninguna venta, así que mostraría stock
-- congelado en el momento de la última carga completa — y eso es el número con
-- el que se decide si se vende la última unidad. Hoy lo tapa el staleTime de 3
-- minutos de React Query; una sync incremental lo destaparía y lo volvería
-- permanente.
--
-- POR QUÉ ES SEGURO HACERLO AHORA. Verificado en todo el repo: NADIE lee
-- `producto_variantes.updated_at`. Es una columna de solo escritura, así que
-- sumarle escrituras es puramente aditivo — no puede cambiar ningún número en
-- pantalla ni ninguna decisión del código actual.
--
-- QUÉ NO CAMBIA:
--
--   * El trigger de `movimientos_stock` sigue igual. Corta con
--     `new.stock is not distinct from old.stock`, así que un UPDATE que solo
--     toca `updated_at` no escribiría movimiento — pero acá el stock siempre
--     cambia, porque es la condición del propio UPDATE.
--   * `ajustar_stock_variante` conserva `#variable_conflict use_column` y los
--     nombres de sus OUT params `id` / `stock`, que son el contrato que lee el
--     POS (`descontado[0].stock`). Ver 20260823182539: renombrarlos rompe la
--     venta.
--   * El guard de stock insuficiente de la versión batch queda intacto.
--
-- LO QUE SIGUE FALTANDO, para que quede escrito: `productos` no tiene columna
-- `updated_at` en absoluto, así que un cambio de precio, de nombre o de
-- `publicado` sigue sin dejar marca en ningún lado. Eso es un ALTER TABLE y un
-- backfill, y va aparte.

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
     set stock      = producto_variantes.stock + p_delta,
         updated_at = now()
   where producto_variantes.id = p_variante_id
     and (p_permitir_negativo or producto_variantes.stock + p_delta >= 0)
  returning producto_variantes.id, producto_variantes.stock;
end;
$$;

revoke all on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) from public;
grant execute on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) to authenticated;

comment on function public.ajustar_stock_variante(uuid, numeric, boolean, text, uuid) is
  'Descuenta o repone stock de UNA variante con UPDATE condicional atómico. Escribe updated_at desde 20260902160000: sin eso la venta no dejaba marca de tiempo y el 99,7% de las variantes tenía updated_at = created_at.';

-- La versión en lote. Ojo con el nombre: es `ajustar_stock_variantes` (plural),
-- no `..._batch`, aunque el archivo que la creó se llame así (20260831140000).
create or replace function public.ajustar_stock_variantes(
  p_movimientos       jsonb,
  p_permitir_negativo boolean default false,
  p_origen            text    default null,
  p_referencia_id     uuid    default null
)
returns table (id uuid, stock numeric)
language plpgsql
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_pedidos    jsonb;
  v_esperados  integer;
  v_aplicados  integer;
  v_faltantes  jsonb;
begin
  if p_origen is not null then
    perform public.marcar_origen_movimiento(p_origen, p_referencia_id);
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object('variante_id', t.variante_id, 'delta', t.delta)),
           '[]'::jsonb
         )
    into v_pedidos
    from (
      select (m->>'variante_id')::uuid as variante_id,
             sum((m->>'delta')::numeric) as delta
        from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) as m
       group by 1
    ) t;

  v_esperados := jsonb_array_length(v_pedidos);
  if v_esperados = 0 then
    return;
  end if;

  perform 1
     from public.producto_variantes v
    where v.id in (
            select p.variante_id
              from jsonb_to_recordset(v_pedidos) as p(variante_id uuid, delta numeric)
          )
    order by v.id
      for update;

  select coalesce(jsonb_agg(p.variante_id), '[]'::jsonb)
    into v_faltantes
    from jsonb_to_recordset(v_pedidos) as p(variante_id uuid, delta numeric)
    left join public.producto_variantes v on v.id = p.variante_id
   where v.id is null
      or (not p_permitir_negativo and v.stock + p.delta < 0);

  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'STOCK_INSUFICIENTE'
      using detail = v_faltantes::text, errcode = 'P0001';
  end if;

  return query
  update public.producto_variantes v
     set stock      = v.stock + p.delta,
         updated_at = now()
    from jsonb_to_recordset(v_pedidos) as p(variante_id uuid, delta numeric)
   where v.id = p.variante_id
     and (p_permitir_negativo or v.stock + p.delta >= 0)
  returning v.id, v.stock;

  get diagnostics v_aplicados = row_count;

  -- El guard real: si se aplicaron menos filas de las pedidas, alguna se quedó
  -- sin mercadería entre el chequeo y el UPDATE. Ver 20260831140000.
  if v_aplicados <> v_esperados then
    raise exception 'STOCK_INSUFICIENTE'
      using detail = '[]', errcode = 'P0001';
  end if;
end;
$function$;

comment on function public.ajustar_stock_variantes(jsonb, boolean, text, uuid) is
  'Descuenta o repone stock de VARIAS variantes en un statement, con lock ordenado por id para evitar deadlocks. Escribe updated_at desde 20260902160000, por el mismo motivo que la versión de a una.';
