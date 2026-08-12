-- Slug de negocio: formato de etiqueta de host + reservadas + índice de lookup.
--
-- El slug deja de ser "texto que salió de slugificar el nombre" y pasa a ser
-- la etiqueta de un subdominio (evens-indumentaria.comerz.app) y la clave con
-- la que security.negocio_publico() resuelve QUÉ catálogo servir. Hasta acá
-- entraba cualquier cosa: crear_negocio_con_owner recibe p_slug ya armado en
-- Node y la base no lo miraba, así que un comercio llamado "App" se llevaba
-- app.comerz.app, que es el host del panel privado.
--
-- Espejo exacto de shared/lib/slug-negocio.ts. La validación en Node es la
-- puerta amable (mensaje de error en el form); esta es el freno: un slug se
-- elige una vez y después vive en los links que la clienta ya mandó.
--
-- Aditiva y verificada contra los 4 negocios vivos: evens-indumentaria,
-- estilo-bonito, ninja-camisetas y clicktostado pasan las dos condiciones.

-- 1) Formato: minúsculas, números y guiones, 3-30, sin guión en las puntas.
--    El rango de largo va en el mismo CHECK que el patrón a propósito: son la
--    misma pregunta ("¿esto es una etiqueta de host válida?").
alter table public.negocios
  drop constraint if exists negocios_slug_formato;

alter table public.negocios
  add constraint negocios_slug_formato
  check (
    slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    and char_length(slug) between 3 and 30
  );

-- 2) Reservadas. Fail-closed: si mañana se agrega un host de plataforma, se
--    agrega acá y ningún negocio nuevo se lo puede llevar. Los que ya existen
--    no se tocan (ninguno colisiona hoy).
alter table public.negocios
  drop constraint if exists negocios_slug_no_reservado;

alter table public.negocios
  add constraint negocios_slug_no_reservado
  check (
    slug not in (
      'app', 'www', 'admin', 'api', 'mail', 'status', 'support', 'help',
      'blog', 'docs', 'cdn', 'static', 'assets', 'auth', 'login'
    )
  );

-- 3) Índice de lookup por slug.
--    Ya existe negocios_slug_key (UNIQUE) — la unicidad no es el problema. Lo
--    que falta es el índice que sirve la consulta REAL de resolución de
--    tenant, que es la del catálogo público y corre en CADA request de
--    cualquier tienda: slug + estado='activo' (ver security.negocio_publico()
--    y shared/lib/tenant.ts). Parcial sobre los activos: es la única variante
--    que se consulta en el camino caliente, y así el índice no crece con los
--    negocios dados de baja.
create index if not exists negocios_slug_activo_idx
  on public.negocios (slug)
  where estado = 'activo';

comment on constraint negocios_slug_formato on public.negocios is
  'El slug es una etiqueta de subdominio (LDH, 3-30). Espejo de shared/lib/slug-negocio.ts.';
comment on constraint negocios_slug_no_reservado on public.negocios is
  'Hosts de la plataforma (app, www, api...) que ningún negocio puede tomar.';
