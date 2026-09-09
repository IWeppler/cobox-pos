/**
 * El embudo ANTES del negocio: registro → confirmación → sesión → negocio.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZA CON `funnel_comerz`
 *
 * El funnel que ya existe arranca en `negocios.created_at`, o sea que su
 * primer escalón es "el negocio ya está creado". Todo lo que pasa antes le es
 * invisible — y ahí es donde se pierde la gente.
 *
 * Medido el 9/9/2026 sobre `auth.users`: cuatro personas confirmaron el mail,
 * iniciaron sesión y nunca crearon su negocio. Ninguna aparece en
 * `funnel_comerz`, porque para entrar a esa tabla hay que haber pasado
 * justamente el paso donde se cayeron. El panel las contaba como si no
 * existieran.
 *
 * Este módulo cubre el tramo que falta y termina exactamente donde el otro
 * empieza.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUIÉN NO ES UNA PÉRDIDA
 *
 * "Cuenta sin negocio" no es una sola cosa, y contarlas todas juntas infla el
 * agujero con gente que está bien:
 *
 *   - El SUPER ADMIN de Comerz no tiene negocio propio por diseño.
 *   - Un EMPLEADO INVITADO no crea negocio: se suma al de otro. Si todavía no
 *     usó el link, no tiene fila en `usuarios_negocios` y se ve idéntico a un
 *     dueño que abandonó. Se distinguen por la invitación pendiente, que es el
 *     mismo criterio que usa `destinoSinNegocio` para decidir a dónde mandarlo.
 *   - Un MIEMBRO NO OWNER ya está adentro de un negocio: llegó al final del
 *     embudo aunque no haya creado nada.
 *
 * Los tres se marcan `fueraDelEmbudo` en vez de borrarse: que no cuenten para
 * la tasa no significa que haya que esconderlos, porque son justamente las
 * filas que uno mira cuando el número no cierra.
 */

/** Lo crudo que devuelve la RPC, una fila por usuario de `auth.users`. */
export interface FilaEmbudoAlta {
  id: string;
  email: string;
  /** Cuándo se creó la cuenta. Es el 100% del embudo. */
  registrado: string;
  /** Cuándo quedó verificado el mail. `null` = nunca lo confirmó. */
  confirmado: string | null;
  /** Última sesión iniciada. `null` = nunca entró. */
  ultimaSesion: string | null;
  /** Alta del negocio del que es owner. `null` = no creó ninguno. */
  negocioCreado: string | null;
  /** Pertenece a algún negocio, aunque no lo haya creado él. */
  miembroDeAlgunNegocio: boolean;
  /** Tiene una invitación de empleado sin usar. */
  invitacionPendiente: boolean;
  esSuperAdmin: boolean;
}

/**
 * En qué escalón quedó. El orden es el del embudo y la UI depende de él.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `SESION` NO QUIERE DECIR QUE LA PERSONA ENTRÓ AL PRODUCTO.
 *
 * Sale de `auth.users.last_sign_in_at`, que Supabase escribe cuando EMITE el
 * token — o sea, en el `POST /auth/v1/token` que dispara `/auth/callback` al
 * canjear el link del mail. La persona no tocó nada: alcanzó con que abriera
 * el mail.
 *
 * Y hasta el 9/9/2026 eso terminaba mal: el callback se ejecutaba dos veces,
 * el segundo canje fallaba y mandaba a "El enlace venció" a alguien que
 * acababa de quedar autenticado. `last_sign_in_at` quedaba cargado igual. O
 * sea que había gente contada como "inició sesión" que lo único que vio fue un
 * cartel de error.
 *
 * Por eso la etiqueta dice "Sesión creada" y no "Entró", y por eso existe
 * `sesionSoloDelLink`: separa la sesión que emitió el mail de una vuelta real.
 * Medir de verdad "vio el paso 2" necesita un evento propio en el onboarding,
 * que todavía no existe.
 * ─────────────────────────────────────────────────────────────────────────
 */
export type EtapaAlta =
  | "REGISTRADO"
  | "CONFIRMADO"
  | "SESION"
  | "CREO_NEGOCIO";

export const ETAPAS: EtapaAlta[] = [
  "REGISTRADO",
  "CONFIRMADO",
  "SESION",
  "CREO_NEGOCIO",
];

export const ETIQUETA_ETAPA: Record<EtapaAlta, string> = {
  REGISTRADO: "Creó la cuenta",
  CONFIRMADO: "Confirmó el mail",
  SESION: "Sesión creada",
  CREO_NEGOCIO: "Creó su negocio",
};

export interface UsuarioEnEmbudo extends FilaEmbudoAlta {
  etapa: EtapaAlta;
  /** No cuenta para la tasa: super admin, invitado o miembro de otro negocio. */
  fueraDelEmbudo: boolean;
  /** Minutos entre el registro y la confirmación. `null` si no confirmó. */
  minutosHastaConfirmar: number | null;
  /** Días parado en su etapa actual. Con `CREO_NEGOCIO` no aplica: terminó. */
  diasEstancado: number | null;
  /**
   * Su ÚLTIMA sesión es la que emitió el link del mail: nunca volvió a entrar.
   *
   * Es un hecho, no una inferencia: `last_sign_in_at` guarda la más reciente,
   * así que si coincide con la confirmación no hubo ninguna después. Lo que NO
   * dice es si llegó a ver algo — con el bug del doble canje (arreglado el
   * 9/9/2026) la sesión se emitía y la persona terminaba en "El enlace
   * venció".
   *
   * Sirve para no leer "Sesión creada" como "estuvo adentro y se aburrió".
   */
  sesionSoloDelLink: boolean;
  /** Cuenta creada probando el flujo. No cuenta para la tasa. */
  esPrueba: boolean;
  /**
   * Se dedujo sola (subaddress de una casilla que ya existe) en vez de estar
   * marcada a mano. Se distingue para poder desconfiar de la deducción: si un
   * cliente real usa `+algo` con una base que también es suya, cae acá y hay
   * que poder verlo.
   */
  pruebaDeducida: boolean;
}

/**
 * `alguien+loquesea@gmail.com` va a la MISMA casilla que `alguien@gmail.com`.
 *
 * Así que si la base también está registrada, las dos cuentas son de la misma
 * persona, y una cuenta extra en tu propio buzón es una prueba. No es una
 * heurística por nombre —nada de buscar "test" o "asd" en el mail, que
 * escondería clientes reales— sino un hecho del direccionamiento.
 *
 * Cubre `ignacionweppler+2/+3/+4` y `iekevelleziel37+1`, que eran 4 de las 10
 * "pérdidas" del 9/9/2026.
 */
export function baseDeSubaddress(email: string): string | null {
  const [local, dominio] = email.toLowerCase().split("@");
  if (!local || !dominio || !local.includes("+")) return null;

  const base = local.slice(0, local.indexOf("+"));
  return base ? `${base}@${dominio}` : null;
}

export interface OpcionesEmbudo {
  ahora?: Date;
  /** Ids marcados a mano en `usuarios_prueba`. */
  marcadosComoPrueba?: ReadonlySet<string>;
}

const MINUTO = 60_000;
const DIA = 86_400_000;

/**
 * Cuánto puede tardar el canje del link en emitir la sesión.
 *
 * Medido: 2 segundos entre `email_confirmed_at` y `last_sign_in_at` en el alta
 * del 9/9. Un minuto es holgado y sigue siendo imposible de confundir con una
 * vuelta a entrar más tarde.
 */
const MARGEN_SESION_DEL_LINK = 60_000;

function etapaDe(f: FilaEmbudoAlta): EtapaAlta {
  // Se lee de atrás para adelante: el escalón más alto que alcanzó.
  //
  // `miembroDeAlgunNegocio` cuenta como llegar al final aunque no haya creado
  // nada: un empleado que aceptó su invitación está adentro del producto, que
  // es lo que el embudo mide.
  if (f.negocioCreado || f.miembroDeAlgunNegocio) return "CREO_NEGOCIO";
  if (f.ultimaSesion) return "SESION";
  if (f.confirmado) return "CONFIRMADO";
  return "REGISTRADO";
}

function momentoDeLaEtapa(f: FilaEmbudoAlta, etapa: EtapaAlta): string {
  if (etapa === "SESION") return f.ultimaSesion ?? f.registrado;
  if (etapa === "CONFIRMADO") return f.confirmado ?? f.registrado;
  return f.registrado;
}

export function analizarEmbudoAlta(
  filas: FilaEmbudoAlta[],
  opciones: OpcionesEmbudo = {},
): UsuarioEnEmbudo[] {
  const { ahora = new Date(), marcadosComoPrueba } = opciones;
  const t = ahora.getTime();

  // Todas las casillas registradas, para resolver los subaddress. Se arma una
  // vez y no por fila: con 22 usuarios da igual, con 2.000 no.
  const casillas = new Set(filas.map((f) => f.email.toLowerCase()));

  return filas.map((f) => {
    const etapa = etapaDe(f);
    const base = baseDeSubaddress(f.email);
    const pruebaDeducida = base !== null && casillas.has(base);
    const esPrueba =
      pruebaDeducida || (marcadosComoPrueba?.has(f.id) ?? false);

    return {
      ...f,
      etapa,
      esPrueba,
      pruebaDeducida,
      fueraDelEmbudo:
        esPrueba ||
        f.esSuperAdmin ||
        f.invitacionPendiente ||
        (f.miembroDeAlgunNegocio && !f.negocioCreado),
      minutosHastaConfirmar: f.confirmado
        ? Math.max(
            0,
            Math.round(
              (new Date(f.confirmado).getTime() -
                new Date(f.registrado).getTime()) /
                MINUTO,
            ),
          )
        : null,
      diasEstancado:
        etapa === "CREO_NEGOCIO"
          ? null
          : Math.max(
              0,
              Math.floor(
                (t - new Date(momentoDeLaEtapa(f, etapa)).getTime()) / DIA,
              ),
            ),
      sesionSoloDelLink:
        f.ultimaSesion !== null &&
        f.confirmado !== null &&
        Math.abs(
          new Date(f.ultimaSesion).getTime() - new Date(f.confirmado).getTime(),
        ) <= MARGEN_SESION_DEL_LINK,
    };
  });
}

export interface EscalonEmbudo {
  etapa: EtapaAlta;
  etiqueta: string;
  /** Cuántos LLEGARON hasta acá (acumulado, no los que quedaron parados). */
  llegaron: number;
  /** Cuántos se quedaron justo en este escalón y no pasaron al siguiente. */
  seCayeron: number;
  /** Porcentaje sobre el total del embudo. 0-100, redondeado. */
  porcentaje: number;
}

export interface ResumenEmbudoAlta {
  total: number;
  escalones: EscalonEmbudo[];
  /** El escalón donde se cae MÁS gente. `null` si no se cayó nadie. */
  peorEscalon: EscalonEmbudo | null;
  /** Mediana de minutos entre registrarse y confirmar, de los que confirmaron. */
  medianaMinutosConfirmar: number | null;
  excluidos: number;
  /**
   * Cuántos de los excluidos son cuentas de prueba. Va aparte del total de
   * excluidos porque es el único que se puede corregir a mano: si el número
   * sorprende, hay una marca mal puesta.
   */
  pruebas: number;
}

export function resumirEmbudoAlta(
  usuarios: UsuarioEnEmbudo[],
): ResumenEmbudoAlta {
  const dentro = usuarios.filter((u) => !u.fueraDelEmbudo);
  const total = dentro.length;

  const escalones: EscalonEmbudo[] = ETAPAS.map((etapa, i) => {
    // Llegó a este escalón el que está acá O más adelante.
    const llegaron = dentro.filter(
      (u) => ETAPAS.indexOf(u.etapa) >= i,
    ).length;
    const seCayeron = dentro.filter((u) => u.etapa === etapa).length;

    return {
      etapa,
      etiqueta: ETIQUETA_ETAPA[etapa],
      llegaron,
      // El último escalón es la meta: quedarse ahí no es caerse.
      seCayeron: etapa === "CREO_NEGOCIO" ? 0 : seCayeron,
      porcentaje: total > 0 ? Math.round((llegaron / total) * 100) : 0,
    };
  });

  const caidas = escalones.filter((e) => e.seCayeron > 0);
  const peorEscalon =
    caidas.length > 0
      ? caidas.reduce((peor, e) => (e.seCayeron > peor.seCayeron ? e : peor))
      : null;

  const minutos = dentro
    .map((u) => u.minutosHastaConfirmar)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);

  return {
    total,
    escalones,
    peorEscalon,
    // Mediana y no promedio: un solo tipo que confirma tres días después
    // corre el promedio y hace parecer que el mail tarda.
    medianaMinutosConfirmar:
      minutos.length > 0 ? minutos[Math.floor(minutos.length / 2)] : null,
    excluidos: usuarios.length - total,
    pruebas: usuarios.filter((u) => u.esPrueba).length,
  };
}
