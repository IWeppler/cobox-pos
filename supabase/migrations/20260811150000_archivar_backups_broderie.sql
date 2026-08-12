-- Saca las cuatro tablas `_backup_*` del alcance de anon.
--
-- Estaban con RLS APAGADO y GRANT de SELECT/INSERT/UPDATE/DELETE a `anon`.
-- Sin RLS el GRANT es lo único que hay, así que cualquiera con la anon key
-- (que es pública) podía leerlas y ESCRIBIRLAS. Es el hallazgo más grave de
-- AUDITORIA-RLS-ANON.md y el único que no depende del deploy del código: nada
-- en la app las lee, así que esto se puede aplicar solo.
--
-- Dos destinos distintos, porque no son la misma cosa:
--
--  * Las tres `_backup_broderie_20260731_*` son la foto previa a la limpieza
--    de los duplicados que generaba el ingreso por remito. NO son copias
--    redundantes: de las 36 variantes respaldadas sólo 11 siguen vivas, de
--    los 28 alias sólo 2, de las 36 filas de stock sólo 9. O sea, son el único
--    registro que queda de lo que se borró. Se MUEVEN a un schema `archivo`
--    en vez de dropearse: la exposición desaparece igual (el schema no tiene
--    USAGE para anon ni para authenticated) y el dato queda intacto y
--    recuperable con un `alter table ... set schema public`.
--
--  * `_backup_perfiles_deprecado_20260802` sí es redundante y se dropea. Era
--    la red de seguridad de 20260802210100 (el drop de perfiles.rol/rol_id/
--    negocio_id). Verificado: las 5 membresías reales siguen en
--    usuarios_negocios con el MISMO rol; las otras 2 filas tienen negocio_id
--    nulo, o sea nunca fueron una membresía. No se pierde nada.

begin;

-- Schema de archivo: sin USAGE para los roles del cliente. Sin USAGE no hay
-- forma de nombrar la tabla, así que el GRANT de tabla deja de importar.
create schema if not exists archivo;
revoke all on schema archivo from anon, authenticated, public;
comment on schema archivo is
  'Tablas fuera de uso que se conservan por las dudas. Sin acceso para anon ni authenticated: sólo service_role/postgres.';

alter table if exists public._backup_broderie_20260731_alias
  set schema archivo;
alter table if exists public._backup_broderie_20260731_stock
  set schema archivo;
alter table if exists public._backup_broderie_20260731_variantes
  set schema archivo;

-- Cinturón además del tirante: mover de schema NO borra los GRANT que la
-- tabla ya tenía. Sin USAGE no se pueden ejercer, pero si mañana alguien le
-- da USAGE al schema, volverían a estar vivos.
revoke all on all tables in schema archivo from anon, authenticated;
alter table archivo._backup_broderie_20260731_alias enable row level security;
alter table archivo._backup_broderie_20260731_stock enable row level security;
alter table archivo._backup_broderie_20260731_variantes enable row level security;

drop table if exists public._backup_perfiles_deprecado_20260802;

commit;
