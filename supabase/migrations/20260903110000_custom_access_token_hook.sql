-- Custom access token hook: mete en el JWT lo que hoy el middleware va a
-- buscar a la base en cada request.
--
-- ESTA MIGRACIÓN NO CAMBIA NADA POR SÍ SOLA. Crea la función y nada la llama:
-- el hook se activa registrándolo en el dashboard (Authentication → Hooks),
-- que es un paso aparte y manual. Y aun registrado, el middleware sigue
-- ignorando el claim hasta que se despliegue el cambio de TypeScript. Esa
-- separación es deliberada: el paso que toca auth queda inerte y verificable
-- antes de que nada dependa de él.
--
-- QUÉ RESUELVE. Hoy el middleware hace DOS viajes a Ohio por request, y corre
-- en runtime edge, o sea lejos de la base siempre. Medido sobre 24 h:
--
--   /auth/v1/user (getUser) ............ 5.616 requests, 140 ms de media
--   rpc/contexto_sesion ................ 5.373 requests, 206 ms de media
--
-- ~346 ms de mediana en serie antes del primer byte. Con el claim, los dos
-- desaparecen: `getClaims()` verifica local con WebCrypto (el proyecto está en
-- claves asimétricas ES256, confirmado en el token real) y el rol sale del
-- token.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ VA EL MAPA COMPLETO Y NO UN `rol`
--
-- El rol depende del NEGOCIO ACTIVO, y el negocio activo sale de una cookie
-- que la persona cambia cuando quiere. El token se emite una vez y se usa en
-- cientos de requests con cookies distintas. Poner un `rol` resuelto sería
-- falso apenas alguien cambia de negocio.
--
-- Verificado además que el hook NO PODRÍA resolverlo aunque quisiera: lo
-- invoca el servidor de Auth, sin contexto de request. En una conexión así,
-- `auth.uid()`, `request.headers`, `request.cookies` y `request.jwt.claims`
-- son todos null, y `security.current_negocio_id()` devuelve null.
--
-- Entonces el corte es por dependencia de la request:
--
--   mapa {negocio: rol} ...... NO depende → va en el claim
--   super_admin .............. NO depende → va en el claim
--   negocio_unico ............ NO depende (es count(*)=1) → va en el claim
--   qué pide la cookie ....... SÍ depende → lo resuelve el middleware
--   si esa cookie es válida .. es buscar en el mapa → ya contestado acá
--
-- `negocio_unico` es el que evita duplicar lógica de verdad: sin él, el
-- TypeScript tendría que reimplementar el atajo "si tenés un solo negocio, ese
-- es el activo" de `current_negocio_id()`. Con él, el middleware solo hace
-- tres búsquedas y no reimplementa ninguna regla.
--
-- El criterio de super admin NO se copia acá: se llama a
-- `security.es_super_admin(p_user_id)`, que existe desde 20260903100000
-- justamente para esto. Dos definiciones de un privilegio es el peor lugar
-- posible para una divergencia.
-- ─────────────────────────────────────────────────────────────────────────
--
-- NO PUEDE FALLAR, Y ESO NO ES PARANOIA. Si este hook lanza, el servidor de
-- Auth deja de emitir tokens: nadie loguea ni refresca y el POS se cae para
-- los cuatro comercios a la vez. Por eso todo el cuerpo va adentro de un
-- bloque con `exception when others then return event`, que devuelve el evento
-- intacto — un token sin el claim, que el middleware sabe manejar (cae al
-- fallback). Degradar es aceptable; no emitir tokens no.
--
-- El presupuesto de los hooks de Postgres es 2 s. Leer 11 filas sobra, pero el
-- modo de falla del límite es el mismo, así que la red de seguridad va igual.
--
-- TAMAÑO. El JWT hoy pesa 800 bytes; el mapa más grande de la base son 98
-- bytes (el único usuario con 2 negocios) y el resto ronda los 50.
--
-- `src` guarda el `authentication_method` con el que Auth llamó al hook. Es
-- diagnóstico y cuesta ~25 bytes, pero se gana algo concreto: es lo que va a
-- CONFIRMAR EMPÍRICAMENTE que el hook corre en cada refresh y no solo al
-- iniciar sesión. La doc lo dice —`token_refresh` está en el enum requerido de
-- `authentication_method`— pero un token real que diga `"src": "token_refresh"`
-- lo prueba sin montar un experimento aparte. Después sirve para entender por
-- qué un token trae claims viejos.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user_id  uuid;
  v_claims   jsonb;
  v_negocios jsonb;
  v_unico    uuid;
begin
  begin
    v_user_id := (event ->> 'user_id')::uuid;

    if v_user_id is null then
      return event;
    end if;

    -- `jsonb_object_agg` sobre cero filas devuelve NULL, no '{}'. Sin el
    -- coalesce, un usuario recién creado (sin negocio todavía) se llevaría un
    -- claim con `negocios: null` y el middleware tendría que defenderse de un
    -- caso que no debería existir.
    select coalesce(jsonb_object_agg(un.negocio_id, un.rol), '{}'::jsonb)
      into v_negocios
      from public.usuarios_negocios un
     where un.usuario_id = v_user_id;

    -- El atajo de `current_negocio_id()`: con UNA sola membresía, esa es la
    -- activa aunque no haya cookie. Con dos o más, sin cookie no hay negocio
    -- activo — y devolver null es lo correcto, no elegir uno.
    if jsonb_typeof(v_negocios) = 'object' and (select count(*) from jsonb_object_keys(v_negocios)) = 1 then
      v_unico := (select k::uuid from jsonb_object_keys(v_negocios) as k limit 1);
    else
      v_unico := null;
    end if;

    v_claims := coalesce(event -> 'claims', '{}'::jsonb);

    v_claims := jsonb_set(
      v_claims,
      '{comerz}',
      jsonb_build_object(
        'v',             1,
        'negocios',      v_negocios,
        'negocio_unico', v_unico,
        'super_admin',   coalesce(security.es_super_admin(v_user_id), false),
        'src',           event ->> 'authentication_method'
      ),
      true
    );

    return jsonb_set(event, '{claims}', v_claims, true);
  exception
    when others then
      -- Ver el encabezado: emitir un token sin el claim es degradar; no emitir
      -- ninguno es dejar a cuatro comercios sin poder vender.
      return event;
  end;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Custom access token hook: agrega el claim `comerz` con el mapa {negocio: rol}, el negocio unico, si es super admin y el authentication_method. NUNCA lanza: ante cualquier error devuelve el evento intacto, porque un hook que falla deja a Auth sin emitir tokens. Ver 20260903110000.';

-- Permisos: solo el servidor de Auth puede invocarlo. Que un usuario pueda
-- llamarlo a mano no filtraria nada (solo lee lo suyo), pero un hook no es una
-- API y no tiene por que estar expuesto.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
