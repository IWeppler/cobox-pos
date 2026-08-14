-- Cuándo se impactó un remito en el stock.
--
-- `creado_en` es cuándo se CARGÓ el remito; el movimiento de stock ocurre al
-- APROBARLO, y entre las dos cosas pueden pasar días. Movimientos de Stock
-- filtraba por `creado_en`, así que un remito cargado a fin de mes y aprobado
-- a principios del siguiente no aparecía en ninguno de los dos períodos.
--
-- El trigger lo pone solo: depender de que cada camino que aprueba se acuerde
-- de setear la fecha es la misma clase de olvido que dejó `producto_id` en
-- null durante meses.

alter table public.ordenes_compra
  add column if not exists aprobado_en timestamptz;

comment on column public.ordenes_compra.aprobado_en is
  'Cuándo se impactó el remito en el stock. Distinto de creado_en. Para las órdenes anteriores a esta columna se sembró con creado_en, que es lo más cercano que había.';

-- Las ya aprobadas se siembran con `creado_en`. No es el dato real —esa fecha
-- se perdió— pero es la mejor aproximación y evita que queden fuera de todo
-- filtro por fecha.
update public.ordenes_compra
set aprobado_en = creado_en
where estado = 'APROBADA' and aprobado_en is null;

create index if not exists idx_ordenes_compra_aprobado_en
  on public.ordenes_compra (aprobado_en desc)
  where estado = 'APROBADA';

create or replace function public.marcar_aprobacion_orden()
returns trigger
language plpgsql
as $$
begin
  -- Solo en la TRANSICIÓN a aprobada: un update posterior sobre una orden ya
  -- aprobada no puede reescribir la fecha en que entró la mercadería.
  if new.estado = 'APROBADA' and coalesce(old.estado, '') <> 'APROBADA' then
    new.aprobado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_aprobacion_orden on public.ordenes_compra;
create trigger trg_marcar_aprobacion_orden
  before update on public.ordenes_compra
  for each row execute function public.marcar_aprobacion_orden();
