-- Aislamiento por negocio: de una llamada POR FILA a una POR STATEMENT.
--
-- El problema no era la función, era la FORMA de invocarla en la policy.
-- `security.same_negocio(negocio_id)` recibe la columna de cada fila como
-- argumento, así que Postgres no la puede resolver una sola vez: la llama por
-- fila. Y como el predicado depende de la fila, queda como `Filter` en vez de
-- `Index Cond` — o sea que el índice de negocio_id ni se usa para buscar.
--
-- Escrito como `negocio_id = (select security.current_negocio_id())`, el
-- subselect escalar se evalúa UNA vez por statement (aparece como InitPlan) y
-- el resultado queda disponible como condición de índice.
--
-- Medido en esta base, sobre productos (1.740 filas), con auth.uid() NULL —
-- que es el camino BARATO, porque current_negocio_id() corta antes de
-- consultar usuarios_negocios:
--
--   security.same_negocio(negocio_id)            69,6 ms   Filter, 1740 filas
--   negocio_id = (select current_negocio_id())     0,94 ms   Index Cond
--
-- Con un usuario real la diferencia es mayor todavía: cada llamada por fila
-- dispara su propio SELECT contra usuarios_negocios.
--
-- Qué NO cambia: quién ve qué. `same_negocio(target)` es literalmente
-- `SELECT target = security.current_negocio_id()`, así que las dos formas dan
-- el mismo resultado fila por fila, incluido el caso NULL (un negocio activo
-- sin resolver da NULL, que en un predicado se trata como falso: fail-closed,
-- igual que antes). Las policies conservan nombre, rol, comando y carácter
-- RESTRICTIVE; solo se reescribe la expresión.
--
-- Las policies de `anon` (`negocio_id = security.negocio_publico()`) NO se
-- tocan: esa función no recibe la columna, así que ya se evalúa una vez y ya
-- resuelve por índice. Verificado con EXPLAIN antes de escribir esto.
--
-- `security.same_negocio()` se mantiene: la usan migraciones viejas y no hay
-- motivo para romper nada. Lo que no debe volver a pasar es usarla DENTRO de
-- una policy — queda anotado en el COMMENT de abajo.

do $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and qual = 'security.same_negocio(negocio_id)'
      and with_check = 'security.same_negocio(negocio_id)'
  loop
    execute format(
      'alter policy %I on %I.%I using (negocio_id = (select security.current_negocio_id())) with check (negocio_id = (select security.current_negocio_id()))',
      r.policyname, r.schemaname, r.tablename
    );
    v_total := v_total + 1;
  end loop;

  raise notice 'Policies de aislamiento reescritas: %', v_total;
end;
$$;

-- Esta va aparte porque tiene el OR del super admin. `is_super_admin()` no
-- recibe la columna, pero adentro de un OR con un predicado por fila se
-- termina evaluando por fila igual: se envuelve en su propio subselect.
alter policy solicitudes_plan_aislamiento on public.solicitudes_plan
  using (
    negocio_id = (select security.current_negocio_id())
    or (select security.is_super_admin())
  )
  with check (
    negocio_id = (select security.current_negocio_id())
    or (select security.is_super_admin())
  );

comment on function security.same_negocio(uuid) is
  'Compara un negocio_id contra el negocio activo. NO USAR EN POLICIES: como '
  'recibe la columna, Postgres la ejecuta por fila y el predicado deja de '
  'poder usar el índice (medido: 69,6 ms vs 0,94 ms sobre 1.740 filas). '
  'Dentro de una policy va: negocio_id = (select security.current_negocio_id()).';

-- Freno: si quedó alguna policy con la forma por fila, esta migración falla en
-- vez de dar por bueno un arreglo a medias.
do $$
declare
  v_faltantes text;
begin
  select string_agg(tablename || '.' || policyname, ', ')
    into v_faltantes
  from pg_policies
  where schemaname = 'public'
    and (qual like '%same_negocio(negocio_id)%'
      or with_check like '%same_negocio(negocio_id)%');

  if v_faltantes is not null then
    raise exception 'Quedaron policies evaluando same_negocio por fila: %', v_faltantes;
  end if;
end;
$$;
