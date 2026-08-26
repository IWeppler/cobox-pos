-- Estado 'demo' para los comercios de MUESTRA: los que abre un vendedor para
-- enseñar el producto.
--
-- Un comercio de demostración tiene que funcionar entero —POS, panel y
-- catálogo público— porque la demo es justamente usarlo. Lo que lo separa de
-- un cliente es que no paga, no vence y no es un candidato: en 'activo'
-- inflaba el MRR con plata que no existe, y en 'prueba' aparecía como
-- oportunidad a punto de terminarse.
--
-- Los tres lugares de la base que enumeran estados se tocan JUNTOS, que es lo
-- que dice `shared/lib/estado-negocio.ts`: si el CHECK acepta un estado que la
-- RLS no conoce, el comercio se guarda bien y después no entra a ningún lado,
-- sin dar error.

alter table public.negocios
  drop constraint if exists negocios_estado_check;

alter table public.negocios
  add constraint negocios_estado_check
  check (estado = any (array['activo', 'prueba', 'demo', 'suspendido', 'cancelado']));

-- El catálogo público del comercio de muestra tiene que abrir: mostrar la
-- tienda es la mitad de la demo.
drop policy if exists negocios_select_anon_activo on public.negocios;

-- `to anon` como estaba: sin eso la policy sale para PUBLIC y le abre la
-- lista de comercios a roles que hoy no la ven.
create policy negocios_select_anon_activo
  on public.negocios
  for select
  to anon
  using (estado = any (array['activo', 'prueba', 'demo']));

create or replace function security.negocio_publico()
returns uuid
language plpgsql
stable parallel safe security definer
set search_path to 'public'
as $function$
DECLARE
    v_slug text;
    v_id   uuid;
BEGIN
    BEGIN
        v_slug := current_setting('request.headers', true)::json ->> 'x-negocio-slug';
    EXCEPTION WHEN OTHERS THEN
        v_slug := NULL;
    END;

    IF v_slug IS NULL OR v_slug = '' THEN
        RETURN NULL;
    END IF;

    -- 'prueba' entra igual que 'activo': durante la prueba la tienda funciona.
    -- 'demo' también: es el comercio que el vendedor muestra, y una tienda que
    -- da 404 no se puede mostrar.
    SELECT id INTO v_id FROM public.negocios
    WHERE slug = v_slug AND estado IN ('activo', 'prueba', 'demo');

    RETURN v_id;
END;
$function$;

comment on column public.negocios.estado is
  'activo (paga) | prueba (14 dias, todavia no pago) | demo (comercio de muestra de los vendedores: funciona entero pero queda afuera de metricas y cobranza) | suspendido (dejo de pagar) | cancelado (se fue). Espejo de ESTADOS_HABILITADOS en shared/lib/estado-negocio.ts.';
