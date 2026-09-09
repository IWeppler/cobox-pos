/**
 * Qué hacer con la lista de precios cuando se elige un cliente que tiene una
 * asignada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE APLICA SOLA Y SIEMPRE
 *
 * El cliente se elige en el paso de PAGO —el atajo F7 incluso avanza hasta ahí
 * para abrir el selector—, o sea DESPUÉS de que el ticket está armado y la
 * clienta ya escuchó el total. Re-preciar en silencio en ese momento le cambia
 * todos los números por detrás, y el que queda explicando es el mostrador.
 *
 * Así que la regla depende de si hay algo cargado:
 *
 *   ticket vacío ....... se aplica sola. No hay nada que cambiar de atrás para
 *                        adelante, y es el camino normal cuando se elige al
 *                        cliente primero.
 *   con renglones ...... se PREGUNTA, mostrando el total de antes y el de
 *                        después. Sin los dos números no hay decisión posible.
 *
 * Y la elección de la vendedora gana sobre todo: si ya tocó el selector a
 * mano, el cliente no vuelve a proponer nada. Un sistema que insiste después
 * de que la persona decidió es un sistema al que se le empieza a decir que no
 * sin leer.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Es pura y sin IO —recibe el estado ya resuelto— por el mismo motivo que
 * `determinar-comprobante.ts`: así las cinco ramas se prueban sin montar el
 * POS entero.
 */

export type SugerenciaLista =
  | { accion: "NADA" }
  /** Aplicar sin preguntar: no hay ticket armado que cambiar. */
  | { accion: "APLICAR"; listaId: string }
  /** Mostrar los dos totales y esperar una respuesta explícita. */
  | { accion: "PREGUNTAR"; listaId: string };

export interface EstadoSugerencia {
  /** `clientes.lista_precio_id` del cliente recién elegido. */
  listaDelCliente: string | null;
  /** La lista con la que se está armando el ticket ahora. */
  listaActivaId: string | null;
  /** La lista del cliente sigue existiendo y activa en este negocio. */
  listaExiste: boolean;
  /** La vendedora ya eligió la lista a mano en este ticket. */
  elegidaAMano: boolean;
  ticketVacio: boolean;
  /** Ya se ofreció esta misma combinación de cliente y lista. */
  yaOfrecida: boolean;
}

const NADA: SugerenciaLista = { accion: "NADA" };

export function decidirSugerenciaDeLista({
  listaDelCliente,
  listaActivaId,
  listaExiste,
  elegidaAMano,
  ticketVacio,
  yaOfrecida,
}: EstadoSugerencia): SugerenciaLista {
  // Un cliente sin lista asignada NO devuelve el ticket a precio base: puede
  // haber una lista elegida a mano para esta venta, y pisarla sería decidir
  // por la vendedora. Ausencia de preferencia no es preferencia por el base.
  if (!listaDelCliente) return NADA;

  // La lista pudo apagarse o borrarse desde Configuración después de haberse
  // asignado. Fail-closed: se ignora, igual que hace `precioDeLista`.
  if (!listaExiste) return NADA;

  if (elegidaAMano) return NADA;
  if (listaDelCliente === listaActivaId) return NADA;
  if (yaOfrecida) return NADA;

  return ticketVacio
    ? { accion: "APLICAR", listaId: listaDelCliente }
    : { accion: "PREGUNTAR", listaId: listaDelCliente };
}
