/**
 * El feed del panel de Comerz: qué pasó y qué hay que atender.
 *
 * Mezcla dos cosas que se ven iguales en pantalla pero NO son lo mismo:
 *
 * - ESTADO (vencido, prueba por terminar, sin plan): se deriva en vivo de los
 *   datos del negocio. No se guarda, y por eso nunca puede quedar
 *   desactualizado — el día que el comercio paga, la fila desaparece sola. Si
 *   fueran filas persistidas harían falta dos crons, uno que las cree y otro
 *   que las borre, y entre corrida y corrida el panel miente.
 * - HECHOS (alta, cambio de plan, pago, pedido de plan): pasaron una vez, en
 *   un instante, y no cambian. Esos sí se guardan (`eventos_comerz`) porque no
 *   hay forma de reconstruirlos después.
 *
 * Módulo puro: recibe negocios y eventos ya resueltos, así la clasificación se
 * testea sin base y sin reloj.
 */

import {
  esNegocioDemo,
  esNegocioDeBaja,
} from "@/shared/lib/estado-negocio";

export type SeveridadNotificacion = "urgente" | "atencion" | "info";

export interface NotificacionComerz {
  id: string;
  negocioId: string | null;
  negocio: string;
  titulo: string;
  detalle: string;
  severidad: SeveridadNotificacion;
  /** Para ordenar el feed. Las derivadas usan la fecha del hecho que las
   * origina (el vencimiento, el fin de la prueba), no "ahora": si usaran ahora
   * saltarían al tope en cada refresh y taparían todo lo demás. */
  fecha: string;
  /** Las derivadas no se pueden marcar como vistas: no son avisos, son el
   * estado actual. Se van cuando se resuelve la causa. */
  accionable: boolean;
  eventoId?: string;
  vista?: boolean;
}

export interface NegocioParaFeed {
  id: string;
  nombre: string;
  estado: string;
  plan_id: string | null;
  plan_nombre: string | null;
  plan_vencimiento: string | null;
  created_at: string;
}

export interface EventoParaFeed {
  id: string;
  negocio_id: string | null;
  negocio: string;
  tipo: string;
  detalle: Record<string, unknown>;
  creado_en: string;
  visto_en: string | null;
}

/**
 * Días entre dos fechas, sobre el día calendario y en UTC de punta a punta.
 *
 * Los getters TIENEN que ser los UTC: `plan_vencimiento` es una columna `date`
 * y "2026-08-16" se parsea como medianoche UTC, que en Argentina (UTC-3) es el
 * 15 a las 21:00 local. Leyéndolo con getDate() daba un día menos y el panel
 * decía "vence en 1 día" cuando faltaban 2. Es el mismo error que ya está
 * documentado en calcular-fecha-vencimiento.ts.
 */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(
    desde.getUTCFullYear(),
    desde.getUTCMonth(),
    desde.getUTCDate(),
  );
  const b = Date.UTC(
    hasta.getUTCFullYear(),
    hasta.getUTCMonth(),
    hasta.getUTCDate(),
  );
  return Math.round((b - a) / 86_400_000);
}

const ETIQUETA_EVENTO: Record<string, string> = {
  NEGOCIO_CREADO: "Comercio nuevo",
  SOLICITUD_PLAN: "Pidió cambiar de plan",
  PAGO_REGISTRADO: "Pago registrado",
  PLAN_CAMBIADO: "Cambió de plan",
  ESTADO_CAMBIADO: "Cambió de estado",
  SLUG_CAMBIADO: "Cambió el link de la tienda",
};

function detalleDeEvento(evento: EventoParaFeed): string {
  const d = evento.detalle ?? {};
  switch (evento.tipo) {
    case "SOLICITUD_PLAN":
    case "PLAN_CAMBIADO":
      return `${d.desde ?? "sin plan"} → ${d.hasta ?? "sin plan"}`;
    case "ESTADO_CAMBIADO":
      return `${d.desde ?? "?"} → ${d.hasta ?? "?"}`;
    case "SLUG_CAMBIADO":
      return `${d.desde ?? "?"} → ${d.hasta ?? "?"}`;
    case "PAGO_REGISTRADO":
      return `$${Number(d.monto ?? 0).toLocaleString("es-AR")} · cubre hasta ${d.periodo_hasta ?? "?"}`;
    case "NEGOCIO_CREADO":
      return "Se registró solo y arrancó la prueba de 14 días";
    default:
      return "";
  }
}

/** Lo que hay que atender HOY, derivado del estado de cada negocio. */
export function derivarPendientes(
  negocios: NegocioParaFeed[],
  ahora: Date,
): NotificacionComerz[] {
  const salida: NotificacionComerz[] = [];

  for (const n of negocios) {
    // Un comercio dado de baja no genera pendientes: ya se fue, y seguir
    // avisando que "venció" es ruido sobre algo que nadie va a cobrar.
    if (esNegocioDeBaja(n.estado)) continue;

    // Un comercio de muestra tampoco: no se le cobra, así que "venció" o
    // "no tiene plan" son avisos sobre una cobranza que no existe. Es el
    // ruido que hace que el feed se deje de leer.
    if (esNegocioDemo(n.estado)) continue;

    const enPrueba = n.plan_nombre === "Prueba";
    const vence = n.plan_vencimiento ? new Date(n.plan_vencimiento) : null;
    const dias = vence ? diasEntre(ahora, vence) : null;

    if (!n.plan_id) {
      salida.push({
        id: `sin-plan-${n.id}`,
        negocioId: n.id,
        negocio: n.nombre,
        titulo: "Sin plan asignado",
        detalle: "No suma al MRR hasta que tenga uno.",
        severidad: "atencion",
        fecha: n.created_at,
        accionable: false,
      });
      continue;
    }

    if (dias === null) continue;

    if (dias < 0) {
      const atraso = Math.abs(dias);
      salida.push({
        id: `vencido-${n.id}`,
        negocioId: n.id,
        negocio: n.nombre,
        titulo: enPrueba ? "Se le terminó la prueba" : "Mes vencido",
        detalle: enPrueba
          ? `Terminó hace ${atraso} día${atraso === 1 ? "" : "s"} y todavía no eligió plan.`
          : `Venció hace ${atraso} día${atraso === 1 ? "" : "s"}.`,
        severidad: "urgente",
        fecha: n.plan_vencimiento!,
        accionable: false,
      });
      continue;
    }

    // El aviso temprano de la prueba es más corto que el de una suscripción
    // paga: son 14 días en total, así que avisar con 15 sería avisar el día uno.
    const umbral = enPrueba ? 3 : 15;
    if (dias <= umbral) {
      salida.push({
        id: `por-vencer-${n.id}`,
        negocioId: n.id,
        negocio: n.nombre,
        titulo: enPrueba ? "La prueba está por terminar" : "Está por vencer",
        detalle:
          dias === 0
            ? "Vence hoy."
            : `Vence en ${dias} día${dias === 1 ? "" : "s"}.`,
        severidad: enPrueba ? "urgente" : "atencion",
        fecha: n.plan_vencimiento!,
        accionable: false,
      });
    }
  }

  return salida;
}

/** El feed completo: pendientes derivados + hechos, ordenados por fecha. */
export function construirFeed(
  negocios: NegocioParaFeed[],
  eventos: EventoParaFeed[],
  ahora: Date,
): NotificacionComerz[] {
  const derivadas = derivarPendientes(negocios, ahora);

  const hechos: NotificacionComerz[] = eventos.map((e) => ({
    id: `evento-${e.id}`,
    eventoId: e.id,
    negocioId: e.negocio_id,
    negocio: e.negocio,
    titulo: ETIQUETA_EVENTO[e.tipo] ?? e.tipo,
    detalle: detalleDeEvento(e),
    severidad: e.tipo === "SOLICITUD_PLAN" ? "atencion" : "info",
    fecha: e.creado_en,
    accionable: true,
    vista: e.visto_en !== null,
  }));

  const PESO: Record<SeveridadNotificacion, number> = {
    urgente: 0,
    atencion: 1,
    info: 2,
  };

  // Primero por severidad y después por fecha: un vencimiento de hace una
  // semana importa más que un alta de hoy, y ordenar solo por fecha lo
  // enterraría abajo de la actividad normal.
  return [...derivadas, ...hechos].sort((a, b) => {
    const porSeveridad = PESO[a.severidad] - PESO[b.severidad];
    if (porSeveridad !== 0) return porSeveridad;
    return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
  });
}
