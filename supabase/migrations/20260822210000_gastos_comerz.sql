-- Los gastos de Comerz dejan de ser solo infraestructura.
--
-- `costos_infra` guardaba UNA fila por proveedor y por mes (vercel, supabase,
-- dominio, otro), y el panel la usaba para restarle infraestructura al margen.
-- Pero un SaaS no gasta solo en servidores: hay sueldos, marketing, impuestos.
-- Con la tabla vieja eso no tenía dónde entrar, así que el margen del panel
-- era optimista por diseño.
--
-- La tabla estaba VACÍA al hacer este cambio (verificado antes de aplicarlo),
-- así que no hay datos que migrar y el rediseño es libre.
--
-- DE PASO, UN BUG QUE NUNCA LLEGÓ A DISPARARSE: `guardarCostoInfraAction`
-- hacía `upsert(..., { onConflict: "mes,proveedor" })`, pero ese índice único
-- NO existía. La acción habría fallado en el primer uso real; no se notó
-- porque nadie llegó a cargar un costo.
--
-- FIJO vs ÚNICO, que es la decisión de modelo:
-- un gasto FIJO se repite todos los meses desde `mes` hasta `hasta`
-- (null = sigue vigente), así el hosting se carga UNA vez y no todos los
-- meses. Uno ÚNICO cuenta solo en su mes.
--
-- Dar de baja un fijo es ponerle `hasta`, NUNCA borrar la fila: el margen de
-- los meses ya cerrados tiene que seguir dando lo mismo el año que viene.

alter table public.costos_infra rename to gastos_comerz;

alter table public.gastos_comerz rename column proveedor to concepto;
alter table public.gastos_comerz drop constraint costos_infra_proveedor_check;

alter table public.gastos_comerz
  add column tipo text not null default 'UNICO'
    check (tipo in ('FIJO', 'UNICO'));

alter table public.gastos_comerz
  add column categoria text not null default 'otro'
    check (categoria in ('infra', 'sueldo', 'marketing', 'impuestos', 'servicios', 'otro'));

alter table public.gastos_comerz add column hasta date;

alter table public.gastos_comerz
  add constraint gastos_comerz_hasta_solo_fijo
    check (hasta is null or tipo = 'FIJO');

alter table public.gastos_comerz
  add constraint gastos_comerz_hasta_posterior
    check (hasta is null or hasta >= mes);

create index if not exists idx_gastos_comerz_mes on public.gastos_comerz (mes);

alter policy costos_infra_super_admin on public.gastos_comerz rename to gastos_comerz_super_admin;

comment on table public.gastos_comerz is
  'Los gastos de Comerz como negocio. Reemplaza a costos_infra, que solo contemplaba proveedores de infraestructura. Un gasto FIJO cuenta en todos los meses desde `mes` hasta `hasta` (null = vigente); uno UNICO cuenta solo en `mes`.';

comment on column public.gastos_comerz.hasta is
  'Ultimo mes en que aplica un gasto FIJO. Null = sigue vigente. Dar de baja un fijo es ponerle fecha aca, NO borrar la fila: el margen de los meses pasados tiene que seguir dando lo mismo.';
