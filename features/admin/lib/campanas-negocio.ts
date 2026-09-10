import type { Campana } from "./campanas-email";
import { TELEFONO_COMERZ } from "./campanas-email";

/**
 * Los mails del ciclo de vida DEL COMERCIO: lo que pasa después de que el
 * negocio existe.
 *
 * `campanas-email.ts` cubre el tramo de antes (registro → negocio creado).
 * Desde ahí en adelante los momentos son otros y el destinatario también: ya
 * no es "alguien que se registró" sino el DUEÑO de un comercio que está
 * usando —o no— el producto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DIFERENCIA CON EL OTRO ARCHIVO: ACÁ EL TEXTO DEPENDE DE LOS DATOS
 *
 * "Cargaste 47 productos y registraste 12 ventas" no se puede escribir en una
 * constante. Por eso este módulo exporta funciones que CONSTRUYEN la campaña a
 * partir de los hechos, y el render sigue siendo el compartido
 * (`renderizarCampana`): una sola forma de mail, dos fuentes de contenido.
 *
 * Sigue siendo puro y sin IO: recibe los hechos de `ciclo_de_vida_negocios()`
 * y devuelve texto. Toda la matriz se testea sin base.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL QUE NO USÓ NADA RECIBE OTRO MAIL, NO EL MISMO
 *
 * Mandarle "elegí tu plan" a alguien que en 14 días no cargó un producto es
 * pedirle plata por algo que no probó. Ese caso pide una llamada, no un link
 * de pago — y es la mitad de los comercios en prueba de hoy (Ninja Camisetas y
 * PequeñasGigantes tienen 0 productos y 0 ventas). Por eso `fin_de_prueba`
 * tiene dos variantes y la elige el dato, no quien manda.
 */

export type ClaveCampanaNegocio =
  | "fin_de_prueba"
  | "fin_de_prueba_sin_uso"
  | "prueba_vencida"
  | "aviso_cobro"
  | "recordatorio_cobro"
  | "inactividad";

/** Los hechos que devuelve `ciclo_de_vida_negocios()`, ya tipados. */
export interface NegocioEnCiclo {
  negocioId: string;
  nombre: string;
  estado: string;
  creado: string;
  planVencimiento: string | null;
  planNombre: string | null;
  planPrecio: number | null;
  /**
   * Link de adhesión a la suscripción de Mercado Pago de ESTE plan.
   *
   * Es del plan y no de Comerz porque el importe de una suscripción es fijo:
   * un solo link mandaría al de Empresa a adherirse al precio de Emprendedor.
   */
  planLink: string | null;
  duenioId: string | null;
  duenioEmail: string | null;
  productos: number;
  ventas: number;
  ultimaVenta: string | null;
  pagos: number;
}

const DIA = 86_400_000;

/** Días hasta el vencimiento. Negativo = ya venció. `null` = sin fecha. */
export function diasParaVencer(
  negocio: NegocioEnCiclo,
  ahora: Date,
): number | null {
  if (!negocio.planVencimiento) return null;
  // Se redondea hacia arriba para que "vence hoy más tarde" sea 0 y no -1: el
  // día del vencimiento todavía es un día de servicio.
  return Math.ceil(
    (new Date(negocio.planVencimiento).getTime() - ahora.getTime()) / DIA,
  );
}

/** Días desde la última venta. `null` = nunca vendió. */
export function diasSinVender(
  negocio: NegocioEnCiclo,
  ahora: Date,
): number | null {
  if (!negocio.ultimaVenta) return null;
  return Math.floor(
    (ahora.getTime() - new Date(negocio.ultimaVenta).getTime()) / DIA,
  );
}

/**
 * Cuándo avisa cada campaña. Están acá arriba y no repartidos adentro de los
 * `if` porque son la política comercial, y esa se discute mirando cuatro
 * números juntos.
 */
export const DIAS_AVISO_FIN_DE_PRUEBA = 3;
/** Hasta cuándo se sigue intentando recuperar una prueba vencida. */
export const DIAS_VENTANA_RECUPERACION = 30;
export const DIAS_AVISO_COBRO = 3;
/** Días de atraso antes del recordatorio. */
export const DIAS_ATRASO_RECORDATORIO = 5;
export const DIAS_INACTIVIDAD = 10;

/**
 * Qué mail le toca a este comercio HOY, o `null` si ninguno.
 *
 * Devuelve UNA campaña y no una lista: dos mails el mismo día a la misma
 * persona es el camino más corto a que los marque como spam. El orden de los
 * `if` es la prioridad, y está ordenado por lo que la persona necesita saber
 * primero — que se le corta el servicio manda sobre que hace días que no vende.
 *
 * `demo` no recibe nada nunca: es el comercio de muestra que usan los
 * vendedores, no un cliente. `cancelado` y `suspendido` tampoco: al que se fue
 * no se le manda un aviso de cobro.
 */
export function campanaQueCorresponde(
  negocio: NegocioEnCiclo,
  ahora: Date = new Date(),
): ClaveCampanaNegocio | null {
  if (negocio.estado === "demo") return null;
  if (negocio.estado !== "activo" && negocio.estado !== "prueba") return null;

  const dias = diasParaVencer(negocio, ahora);
  const sinVender = diasSinVender(negocio, ahora);

  if (negocio.estado === "prueba" && dias !== null) {
    if (dias >= 0 && dias <= DIAS_AVISO_FIN_DE_PRUEBA) {
      // El que no cargó nada no está a tres días de comprar: está a tres días
      // de no volver. Es otro mail.
      return negocio.productos === 0 && negocio.ventas === 0
        ? "fin_de_prueba_sin_uso"
        : "fin_de_prueba";
    }

    // Vencida, pero no para siempre: pasada la ventana ya no es una
    // recuperación sino un mail a alguien que se fue hace un mes.
    if (dias < 0 && dias >= -DIAS_VENTANA_RECUPERACION) {
      return "prueba_vencida";
    }
  }

  if (negocio.estado === "activo" && dias !== null) {
    if (dias >= 0 && dias <= DIAS_AVISO_COBRO) return "aviso_cobro";
    if (dias <= -DIAS_ATRASO_RECORDATORIO) return "recordatorio_cobro";
  }

  // La inactividad va última: es la señal más suave de las cuatro y la única
  // que no tiene fecha límite. Pide haber vendido alguna vez — un comercio que
  // NUNCA vendió no dejó de usarlo, todavía no empezó, y eso es activación.
  if (sinVender !== null && sinVender >= DIAS_INACTIVIDAD) {
    return "inactividad";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** "cargaste 47 productos y registraste 12 ventas" */
function loQueHizo(negocio: NegocioEnCiclo): string {
  const partes: string[] = [];
  if (negocio.productos > 0) {
    partes.push(`cargaste ${plural(negocio.productos, "producto", "productos")}`);
  }
  if (negocio.ventas > 0) {
    partes.push(`registraste ${plural(negocio.ventas, "venta", "ventas")}`);
  }
  if (partes.length === 0) return "";
  return partes.join(" y ");
}

export interface ContextoCampanaNegocio {
  ahora?: Date;
  /**
   * Link de pago de respaldo, para cuando el plan no tiene el suyo. Sin
   * ninguno de los dos, las campañas de cobro NO se arman: un aviso de cobro
   * sin cómo pagar convierte un mail en un trabajo para el que lo recibe y en
   * tres transferencias que hay que perseguir.
   */
  linkDePago?: string | null;
  /**
   * Alias de Mercado Pago, para el que no se quiere adherir a un débito
   * automático. Va como SEGUNDA opción y nunca como única: un alias suelto
   * obliga a avisar el pago por WhatsApp, que es el trabajo que la suscripción
   * viene a sacar del medio.
   */
  alias?: string | null;
}

/**
 * El link que le corresponde a este comercio: el de SU plan, y si no tiene, el
 * de respaldo. Devuelve además si es una adhesión a suscripción, porque el
 * texto no es el mismo: "pagá" y "adherite y se debita solo" prometen cosas
 * distintas y la segunda hay que decirla con todas las letras antes de que
 * alguien firme un débito automático.
 */
export function linkDePagoDe(
  negocio: NegocioEnCiclo,
  contexto: ContextoCampanaNegocio,
): { url: string; esSuscripcion: boolean } | null {
  if (negocio.planLink) return { url: negocio.planLink, esSuscripcion: true };
  if (contexto.linkDePago) {
    return { url: contexto.linkDePago, esSuscripcion: false };
  }
  return null;
}

/**
 * La segunda opción de pago, cuando hay alias cargado.
 *
 * Devuelve un array para poder no devolver nada: sin alias, el párrafo no
 * existe en vez de existir vacío o con un "consultanos" que no dice nada.
 *
 * Va SIEMPRE después del botón y nunca en lugar de él. Un alias suelto obliga
 * a mandar el comprobante por WhatsApp y a que alguien lo cargue a mano, que
 * es el trabajo que la suscripción viene a sacar del medio: es la salida para
 * el que no quiere débito automático, no la opción principal.
 */
function alternativaDeAlias(
  contexto: ContextoCampanaNegocio,
  importe: string,
): string[] {
  if (!contexto.alias) return [];
  return [
    `Si preferís transferir, el alias es ${contexto.alias} (${importe}). Mandanos el comprobante por WhatsApp y lo registramos.`,
  ];
}

/**
 * El texto del mail de este comercio.
 *
 * Devuelve `null` cuando la campaña no se puede armar con lo que hay — hoy
 * pasa solo con las de cobro sin link de pago (ni el del plan ni el de
 * respaldo). Fail-closed a propósito: es preferible que el botón no exista a
 * mandar un aviso de cobro que no dice cómo pagar.
 */
export function construirCampanaNegocio(
  clave: ClaveCampanaNegocio,
  negocio: NegocioEnCiclo,
  contexto: ContextoCampanaNegocio = {},
): Campana | null {
  const ahora = contexto.ahora ?? new Date();
  const dias = diasParaVencer(negocio, ahora);
  const sinVender = diasSinVender(negocio, ahora);
  const hizo = loQueHizo(negocio);
  const ayuda = `Cualquier cosa respondé este mail o escribinos al ${TELEFONO_COMERZ}.`;

  switch (clave) {
    /**
     * El único mail que convierte prueba en plata. Lleva lo que la persona
     * hizo adentro, con los números de su propio comercio: es la diferencia
     * entre "elegí un plan" y "esto que armaste sigue funcionando si elegís
     * un plan".
     */
    case "fin_de_prueba":
      return {
        clave,
        asunto:
          dias !== null && dias > 0
            ? `Te quedan ${plural(dias, "día", "días")} de prueba en Comerz`
            : "Hoy termina tu prueba de Comerz",
        intro: [
          `Tu prueba de Comerz${dias !== null && dias > 0 ? ` termina en ${plural(dias, "día", "días")}` : " termina hoy"}. En estas dos semanas ${hizo} en ${negocio.nombre}.`,
          "Todo eso queda tal cual está: elegís un plan y seguís trabajando sin cambiar nada.",
        ],
        cta: { texto: "Elegir mi plan", ruta: "/perfil" },
        beneficios: [],
        cierre: [
          "Si querés que te ayudemos a elegir el plan que te conviene, decinos cuántas ventas hacés por mes y te lo decimos nosotros.",
          ayuda,
        ],
      };

    /**
     * Mismo momento, comercio que no cargó nada. Pedirle plata sería pedirle
     * plata por algo que no llegó a ver. Se ofrece una llamada.
     */
    case "fin_de_prueba_sin_uso":
      return {
        clave,
        asunto: "¿Te ayudamos a arrancar con Comerz?",
        intro: [
          `Abriste ${negocio.nombre} en Comerz hace dos semanas y todavía no llegaste a cargar tus productos. Nos pasa seguido: el primer día es el que más cuesta.`,
          "Antes de que se te venza la prueba, te ofrecemos algo mejor que un mail: media hora con nosotros y te dejamos el sistema cargado y funcionando con tu mercadería.",
        ],
        cta: { texto: "Coordinar por WhatsApp", ruta: "https://wa.me/541154702118" },
        beneficios: [],
        cierre: [
          `Escribinos al ${TELEFONO_COMERZ} y coordinamos el día. Si preferís seguir solo, entrá cuando quieras: tu cuenta sigue ahí.`,
        ],
      };

    /**
     * La ventana de recuperación. La mitad de los que no renuevan no
     * decidieron nada: se olvidaron. Lo importante del mail es que los datos
     * siguen estando.
     */
    case "prueba_vencida":
      return {
        clave,
        asunto: `${negocio.nombre} sigue esperándote en Comerz`,
        intro: [
          `Se te venció la prueba${dias !== null ? ` hace ${plural(Math.abs(dias), "día", "días")}` : ""} y tu cuenta quedó pausada.`,
          hizo
            ? `Todo lo que cargaste sigue ahí: ${hizo}. No se borró nada y se reactiva en el momento en que elijas un plan.`
            : "Tu cuenta sigue ahí y se reactiva en el momento en que elijas un plan.",
        ],
        cta: { texto: "Reactivar mi cuenta", ruta: "/perfil" },
        beneficios: [],
        cierre: [
          "Si no seguiste porque algo no te sirvió, contanos qué era. Nos sirve más que el plan.",
          ayuda,
        ],
      };

    /**
     * El que saca de encima perseguir transferencias. Sin link de pago no se
     * arma: un aviso de cobro sin cómo pagar es trabajo para el otro.
     */
    case "aviso_cobro": {
      const pago = linkDePagoDe(negocio, contexto);
      if (!pago) return null;

      const importe = negocio.planPrecio
        ? `$${negocio.planPrecio.toLocaleString("es-AR")}`
        : "tu plan";

      return {
        clave,
        asunto: `Tu plan de Comerz se renueva ${dias === 0 ? "hoy" : `en ${plural(dias ?? 0, "día", "días")}`}`,
        intro: [
          `Se renueva el plan ${negocio.planNombre ?? ""} de ${negocio.nombre} por ${importe}.`,
          pago.esSuscripcion
            ? "Podés dejarlo automático: te adherís una vez y todos los meses se debita solo, sin que tengas que acordarte ni avisarnos. Lo cancelás cuando quieras desde tu Mercado Pago."
            : "Podés pagarlo desde acá y queda listo:",
        ],
        cta: {
          texto: pago.esSuscripcion ? "Adherirme y olvidarme" : "Pagar ahora",
          ruta: pago.url,
        },
        beneficios: [],
        cierre: [
          ...alternativaDeAlias(contexto, importe),
          "Si ya lo pagaste, ignorá este mail: puede haberse cruzado con la acreditación.",
          ayuda,
        ],
      };
    }

    /**
     * El recordatorio del atrasado. No amenaza: el corte de servicio lo
     * maneja el banner escalonado de la app, y decirlo dos veces por dos
     * canales distintos es como se pierde un cliente que solo se distrajo.
     */
    case "recordatorio_cobro": {
      const pago = linkDePagoDe(negocio, contexto);
      if (!pago) return null;

      const atraso = dias !== null ? Math.abs(dias) : 0;
      const importe = negocio.planPrecio
        ? `$${negocio.planPrecio.toLocaleString("es-AR")}`
        : "el plan";

      return {
        clave,
        asunto: `Quedó pendiente el pago de ${negocio.nombre}`,
        intro: [
          `El plan de ${negocio.nombre} venció hace ${plural(atraso, "día", "días")} y todavía no nos figura el pago.`,
          "Si se te pasó, se resuelve en un minuto:",
        ],
        cta: {
          texto: pago.esSuscripcion ? "Ponerlo automático" : "Pagar ahora",
          ruta: pago.url,
        },
        beneficios: [],
        cierre: [
          ...alternativaDeAlias(contexto, importe),
          "Si estás con el mes complicado, decínoslo y lo acomodamos. Preferimos eso a que dejes de usarlo.",
          ayuda,
        ],
      };
    }

    /**
     * La alerta temprana de baja. El mail es una excusa para que conteste: lo
     * que sirve no es que vuelva a entrar, es enterarse de POR QUÉ dejó.
     */
    case "inactividad":
      return {
        clave,
        asunto: `¿Todo bien con ${negocio.nombre}?`,
        intro: [
          `Vimos que hace ${plural(sinVender ?? DIAS_INACTIVIDAD, "día", "días")} que no se registran ventas en ${negocio.nombre}.`,
          "Puede ser que estés vendiendo por otro lado, que algo del sistema te esté trabando, o simplemente que fue una semana tranquila. Nos interesa saber cuál de las tres.",
        ],
        cta: { texto: "Entrar a mi panel", ruta: "/" },
        beneficios: [],
        cierre: [
          "Respondé este mail con una línea y te contestamos nosotros, no un robot.",
          ayuda,
        ],
      };
  }
}

export const ETIQUETA_CAMPANA_NEGOCIO: Record<ClaveCampanaNegocio, string> = {
  fin_de_prueba: "Fin de prueba",
  fin_de_prueba_sin_uso: "Fin de prueba (sin uso)",
  prueba_vencida: "Prueba vencida",
  aviso_cobro: "Aviso de cobro",
  recordatorio_cobro: "Recordatorio de cobro",
  inactividad: "Inactividad",
};

/**
 * Las de cobro se repiten TODOS LOS MESES, así que su clave lleva el período.
 *
 * Sin esto, el unique de `envios_email` —que existe para que el mismo mail no
 * salga dos veces— haría que el aviso de cobro salga UNA sola vez en la vida
 * del comercio. El período es el mes del vencimiento, no el de hoy: un
 * recordatorio mandado el 3 de octubre por un vencimiento del 28 de septiembre
 * pertenece a septiembre.
 */
export function claveDeEnvio(
  clave: ClaveCampanaNegocio,
  negocio: NegocioEnCiclo,
): string {
  const esDeCobro = clave === "aviso_cobro" || clave === "recordatorio_cobro";
  if (!esDeCobro || !negocio.planVencimiento) return clave;

  const v = new Date(negocio.planVencimiento);
  const periodo = `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${clave}:${periodo}`;
}
