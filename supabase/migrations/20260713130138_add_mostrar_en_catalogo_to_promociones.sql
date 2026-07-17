
alter table public.promociones
  add column mostrar_en_catalogo boolean not null default false;

alter table public.promociones
  alter column tipo_regla drop not null;

update public.promociones
  set mostrar_en_catalogo = true,
      tipo_regla = null
  where tipo_regla = 'CANAL_PUBLICO';
