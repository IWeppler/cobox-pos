/**
 * El rol y el negocio activo, leídos del JWT en vez de la base.
 *
 * POR QUÉ EXISTE. El middleware corre en runtime edge —cerca del usuario y
 * LEJOS de la base, siempre— y hacía dos viajes a Ohio por request:
 * `getUser()` contra el servidor de auth y `contexto_sesion()` contra
 * Postgres. Medido sobre 24 h: 5.616 + 5.373 requests, 140 ms y 206 ms de
 * media. ~346 ms en serie antes del primer byte, en cada navegación.
 *
 * Con el custom access token hook (20260903110000) esos datos viajan en el
 * token, y `getClaims()` lo verifica LOCAL con WebCrypto — el proyecto está en
 * claves asimétricas ES256, confirmado leyendo un token real.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTE ARCHIVO Y QUÉ NO
 *
 * Es la ÚNICA lógica que queda duplicada entre TypeScript y SQL, y conviene
 * ser explícito sobre eso en vez de esconderlo.
 *
 * El claim NO trae un `rol` resuelto: trae el mapa {negocio: rol}, el negocio
 * único y si es super admin. Todo eso lo calculó la base. Lo que el token no
 * puede saber es QUÉ NEGOCIO pide esta request —sale de una cookie que la
 * persona cambia cuando quiere, y un token se emite una vez para cientos de
 * requests— así que esa última resolución pasa por acá.
 *
 * El espejo en SQL es `security.current_negocio_id()` + `public.rol_actual()`,
 * y las funciones de abajo replican su semántica EXACTA, incluidos los dos
 * casos que es fácil equivocar (ver los comentarios de cada rama).
 *
 * SI DIVERGEN, el síntoma es un redirect equivocado, no una fuga: la RLS sigue
 * resolviendo con las funciones de SQL en cada consulta, y ahí no participa
 * este archivo. Ese es el motivo por el que la duplicación es tolerable — no
 * que sea inofensiva.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Forma del claim que escribe el hook. Subirla obliga a tocar el hook. */
export const VERSION_CLAIM_COMERZ = 1;

export interface ClaimComerz {
  v: number;
  /** {negocio_id: rol} de todas las membresías del usuario. */
  negocios: Record<string, string>;
  /** El negocio activo cuando hay UNA sola membresía y no hay cookie. Lo
   * precalcula el hook para que acá no haya que reimplementar ese atajo. */
  negocio_unico: string | null;
  super_admin: boolean;
  /** `authentication_method` con el que Auth emitió el token. Diagnóstico. */
  src?: string | null;
}

export interface ContextoSesion {
  /** null = hay usuario pero no hay negocio activo (hay que elegir uno). */
  rol: string | null;
  negocioId: string | null;
  esSuperAdmin: boolean;
}

/**
 * Valida que el claim tenga la forma esperada.
 *
 * Devuelve null —y el que llama cae al fallback contra la base— cuando el
 * token no lo trae (sesión emitida antes de registrar el hook), cuando la
 * versión no es la que este código entiende, o cuando la forma no cierra.
 *
 * Fallar hacia el fallback y no hacia un rol por defecto es deliberado: un
 * default permisivo abriría rutas y uno restrictivo dejaría gente afuera. La
 * base ya sabe la respuesta; se le pregunta a ella.
 */
export function leerClaimComerz(claims: unknown): ClaimComerz | null {
  if (!claims || typeof claims !== "object") return null;

  const bruto = (claims as Record<string, unknown>).comerz;
  if (!bruto || typeof bruto !== "object") return null;

  const c = bruto as Record<string, unknown>;
  if (c.v !== VERSION_CLAIM_COMERZ) return null;
  if (!c.negocios || typeof c.negocios !== "object") return null;

  return {
    v: VERSION_CLAIM_COMERZ,
    negocios: c.negocios as Record<string, string>,
    negocio_unico:
      typeof c.negocio_unico === "string" ? c.negocio_unico : null,
    super_admin: c.super_admin === true,
    src: typeof c.src === "string" ? c.src : null,
  };
}

/**
 * Espejo de `security.current_negocio_id()` + `public.rol_actual()`.
 *
 * El orden de las ramas es el de la función SQL y no se puede reacomodar.
 */
export function resolverContextoDesdeClaim(
  claim: ClaimComerz,
  cookies: {
    negocioActivo?: string | null;
    impersonando?: string | null;
  },
): ContextoSesion {
  const { negocioActivo, impersonando } = cookies;

  // RAMA 1 — Impersonación del super admin.
  //
  // NO se valida contra el mapa, y es a propósito: `current_negocio_id()`
  // devuelve el pedido tal cual en esta rama. El super admin no tiene
  // membresías (verificado: su mapa viene vacío), así que validar lo dejaría
  // sin poder impersonar a nadie — que es justamente para lo que existe.
  if (claim.super_admin && impersonando) {
    // `rol_actual()`: super admin con negocio resuelto es ADMIN, venga o no de
    // una membresía.
    return { rol: "ADMIN", negocioId: impersonando, esSuperAdmin: true };
  }

  // RAMA 2 — La cookie pide un negocio.
  //
  // OJO: si la cookie pide uno del que NO es miembro, el resultado es NULL y
  // NO se sigue a la rama 3. La función SQL hace exactamente eso (busca en
  // `usuarios_negocios` y devuelve lo que encuentre, que puede ser null).
  // "Cambiar" a un negocio ajeno tiene que dejarte sin negocio activo, no
  // devolverte silenciosamente al tuyo.
  if (negocioActivo) {
    const rolEnEseNegocio = claim.negocios[negocioActivo];
    if (rolEnEseNegocio === undefined) {
      return { rol: null, negocioId: null, esSuperAdmin: claim.super_admin };
    }
    return {
      rol: claim.super_admin ? "ADMIN" : rolEnEseNegocio,
      negocioId: negocioActivo,
      esSuperAdmin: claim.super_admin,
    };
  }

  // RAMA 3 — Sin cookie: si hay UNA sola membresía, esa es la activa. Con dos
  // o más, no hay negocio activo y hay que elegir. El hook ya resolvió cuál
  // es (o null), así que acá no se cuenta nada.
  if (claim.negocio_unico) {
    return {
      rol: claim.super_admin
        ? "ADMIN"
        : (claim.negocios[claim.negocio_unico] ?? null),
      negocioId: claim.negocio_unico,
      esSuperAdmin: claim.super_admin,
    };
  }

  return { rol: null, negocioId: null, esSuperAdmin: claim.super_admin };
}
