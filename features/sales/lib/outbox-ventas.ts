import { openDB, type IDBPDatabase } from "idb";

/**
 * Las ventas cobradas sin señal, esperando subir.
 *
 * QUÉ ES. Una cola en el celular. La venta se cobra igual —la clienta paga y
 * se lleva la mercadería— y el registro viaja cuando vuelve la conexión.
 *
 * POR QUÉ SE PUEDE HACER SIN DUPLICAR NADA. El `ventaId` se genera ACÁ, en el
 * cliente, y es la PK de `ventas`. `registrar_venta` inserta con `on conflict
 * do nothing`: si la venta ya había entrado —el intento anterior llegó y lo
 * que se perdió fue la respuesta— devuelve `ya_registrada` y no cobra dos
 * veces. Sin esa propiedad, una cola de reintentos sería una máquina de
 * duplicar ventas.
 *
 * QUÉ SE GUARDA. Los mismos campos que viajan en el FormData de una venta
 * normal, en texto plano: al sincronizar se reconstruye el FormData idéntico y
 * se llama a la MISMA action. No hay un segundo camino a la plata — que es la
 * regla que ya rige para el atajo de confirmar del ticket.
 *
 * LO QUE NO RESUELVE, y hay que saberlo:
 *
 * - El STOCK se descuenta recién al sincronizar. Dos cajas offline pueden
 *   vender la última unidad: al subir, una de las dos deja el stock en
 *   negativo. Es la decisión tomada (dos vendedoras en el mismo local, el
 *   riesgo es bajo y el costo de bloquear la venta es perder la venta).
 *
 * - iOS no tiene Background Sync: esto corre SOLO con la app abierta. Por eso
 *   el turno de caja no se puede cerrar con ventas pendientes — es el momento
 *   del día en que alguien seguro está mirando la pantalla.
 */

const DB_NAME = "comerz-ventas-offline";
const STORE_NAME = "pendientes";
const DB_VERSION = 1;

export type VentaPendiente = {
  /** El id que va a tener la venta en la base. Clave de idempotencia. */
  ventaId: string;
  negocioId: string;
  /** Los campos del FormData, tal cual se mandan online. */
  campos: Record<string, string>;
  /** Cuándo se cobró de verdad, en el mostrador. */
  vendidaEn: string;
  /** Para mostrarla en la lista de pendientes sin re-parsear el carrito. */
  total: number;
  intentos: number;
  /** El último error del server. Si está, la venta necesita que alguien mire:
   * ya no es un problema de señal. */
  ultimoError?: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "ventaId",
          });
          store.createIndex("negocioId", "negocioId");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Guarda una venta para subirla después.
 *
 * Devuelve `false` si NO se pudo guardar. Ese caso importa más que el feliz:
 * si el celular no tiene dónde anotar la venta, la vendedora tiene que
 * enterarse ANTES de entregar la mercadería, no después.
 */
export async function encolarVenta(venta: VentaPendiente): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.put(STORE_NAME, venta);
    return true;
  } catch (error) {
    console.error("[VENTA OFFLINE] No se pudo encolar la venta", error);
    return false;
  }
}

export async function ventasPendientes(
  negocioId: string,
): Promise<VentaPendiente[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const todas = (await db.getAllFromIndex(
      STORE_NAME,
      "negocioId",
      negocioId,
    )) as VentaPendiente[];
    // Se suben en el orden en que se cobraron: el arqueo del turno se lee así,
    // y una venta de las 15:00 entrando después de una de las 15:40 confunde
    // a cualquiera que mire el historial mientras sincroniza.
    return todas.sort((a, b) => a.vendidaEn.localeCompare(b.vendidaEn));
  } catch {
    return [];
  }
}

export async function contarVentasPendientes(
  negocioId: string,
): Promise<number> {
  const pendientes = await ventasPendientes(negocioId);
  return pendientes.length;
}

export async function quitarVentaPendiente(ventaId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete(STORE_NAME, ventaId);
  } catch (error) {
    // Grave: la venta subió pero sigue en la cola, así que se va a reintentar.
    // No se pierde plata —el reintento devuelve `ya_registrada` y no duplica—
    // pero queda un pendiente fantasma que traba el cierre de caja.
    console.error(
      "[VENTA OFFLINE] CRÍTICO: la venta se sincronizó pero no se pudo sacar de la cola",
      { ventaId, error },
    );
  }
}

/** Deja anotado por qué falló, para que el próximo intento no sea a ciegas y
 * para poder mostrarlo. No saca la venta de la cola: eso solo pasa cuando el
 * server la confirma. */
export async function marcarIntentoFallido(
  ventaId: string,
  error: string,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const venta = (await db.get(STORE_NAME, ventaId)) as
      | VentaPendiente
      | undefined;
    if (!venta) return;
    await db.put(STORE_NAME, {
      ...venta,
      intentos: venta.intentos + 1,
      ultimoError: error,
    } satisfies VentaPendiente);
  } catch {
    // Anotar el error no puede romper la sincronización de las que siguen.
  }
}
