-- ============================================================================
-- MARCAR UNA CUENTA COMO PRUEBA PROPIA
-- ============================================================================
--
-- El embudo de alta (`20260909120000`) mide cuánta gente llega a crear su
-- negocio. Las cuentas que se crean probando el flujo cuentan como pérdidas y
-- hunden la tasa: el 9/9/2026, cuatro de las diez que figuraban "sin negocio"
-- eran pruebas propias, o sea que el 41% real era bastante mejor.
--
-- La mayoría se deduce sin marcar nada: `ignacionweppler+4@gmail.com` es un
-- subaddress de una casilla que YA existe en `auth.users`, así que va al mismo
-- buzón y es de la misma persona. Eso lo resuelve `embudo-alta.ts` sin
-- guardar nada.
--
-- Esta tabla es para el resto: la cuenta de prueba hecha con OTRO mail, que no
-- tiene ninguna marca en el dato y solo la persona que la creó sabe qué es.
-- Una heurística por nombre ("test", "prueba", "asd") escondería cuentas
-- reales, y esconder un cliente real del embudo es peor que contar una prueba
-- de más.
--
-- No borra ni oculta al usuario: solo lo saca del denominador. Sigue
-- apareciendo en la lista, marcado.
-- ============================================================================

create table if not exists public.usuarios_prueba (
  usuario_id uuid primary key,
  -- Sin FK a auth.users a propósito: el registro de que algo era una prueba
  -- tiene que sobrevivir a que la cuenta se borre, que es lo que normalmente
  -- se hace con una prueba. Mismo criterio que `ventas_items.variante_id`.
  motivo text,
  marcado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

comment on table public.usuarios_prueba is
  'Cuentas creadas probando el flujo de alta. Salen del denominador del embudo (embudo_de_alta) sin desaparecer de la lista. Ver 20260909130000.';
comment on column public.usuarios_prueba.usuario_id is
  'auth.users.id. SIN FK: la marca sobrevive a que la cuenta de prueba se borre.';

alter table public.usuarios_prueba enable row level security;

-- Es un dato de Comerz, no de un tenant: no lleva `negocio_id` ni policy de
-- aislamiento por negocio. Lo escribe y lo lee UNA persona.
create policy usuarios_prueba_super_admin on public.usuarios_prueba
  for all
  using (security.is_super_admin())
  with check (security.is_super_admin());

revoke all on public.usuarios_prueba from anon;
grant select, insert, delete on public.usuarios_prueba to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.usuarios_prueba', 'select') then
    raise exception 'GUARD: anon puede leer usuarios_prueba';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'usuarios_prueba'
      and qual like '%is_super_admin%'
  ) then
    raise exception 'GUARD: usuarios_prueba quedo sin el corte de super admin';
  end if;
end $$;
