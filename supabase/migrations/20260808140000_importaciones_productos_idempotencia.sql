-- Idempotencia del import de planilla.
--
-- Hasta ahora la única protección contra importar dos veces el mismo archivo
-- era el `isPending` del botón, que no sobrevive a un F5 ni a un "no sé si
-- funcionó, lo subo de nuevo". El propio modal lo avisaba en texto. Es la
-- misma forma del incidente del 27/7 en Estilo Bonito: reintentos que
-- multiplican el stock.
--
-- Registro de importaciones + guard con el mismo orden que
-- aprobar_orden_compra: el INSERT del guard va PRIMERO, antes de escribir
-- una sola unidad de stock. Ese insert toma el row lock que serializa dos
-- importaciones concurrentes del mismo archivo, y "ya se importó" vuelve
-- como resultado normal (`ya_importada: true`), no como excepción.
--
-- El unique es PARCIAL (`where not forzada`): la primera importación de un
-- hash es única, y una reimportación explícita del usuario (forzada = true)
-- siempre puede registrarse. Así el guard no se convierte en una pared que
-- obligue a inventar hashes falsos para el caso legítimo de "sí, quiero
-- sumar este stock de nuevo".

create table if not exists public.importaciones_productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null default security.current_negocio_id()
    references public.negocios(id) on delete cascade,
  -- sha256 del CONTENIDO parseado (ver hash-import-productos.ts): la misma
  -- planilla en CSV y en XLSX da el mismo hash.
  hash text not null,
  nombre_archivo text,
  forzada boolean not null default false,
  filas_totales integer not null default 0,
  filas_ok integer not null default 0,
  filas_error integer not null default 0,
  importado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create unique index if not exists importaciones_productos_negocio_hash_key
  on public.importaciones_productos (negocio_id, hash)
  where not forzada;

create index if not exists idx_importaciones_productos_negocio_fecha
  on public.importaciones_productos (negocio_id, creado_en desc);

alter table public.importaciones_productos enable row level security;

-- Mismas dos policies que el resto de las tablas del tenant (ver
-- ordenes_compra / bajas): la RESTRICTIVE `aislamiento_negocio` es el freno
-- real y la PERMISSIVE define quién opera.
drop policy if exists aislamiento_negocio on public.importaciones_productos;
create policy aislamiento_negocio
  on public.importaciones_productos
  as restrictive
  for all
  to authenticated
  using (security.same_negocio(negocio_id))
  with check (security.same_negocio(negocio_id));

drop policy if exists "Permitir gestion de importaciones a staff"
  on public.importaciones_productos;
create policy "Permitir gestion de importaciones a staff"
  on public.importaciones_productos
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.importaciones_productos is
  'Una fila por import de planilla ejecutado. El unique parcial '
  '(negocio_id, hash) where not forzada es el guard de idempotencia que '
  'consume importar_productos_planilla.';
