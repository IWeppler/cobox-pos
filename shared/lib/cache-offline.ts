import { openDB, type IDBPDatabase } from "idb";

/**
 * El catálogo, guardado en el celular para que la app sirva sin señal.
 *
 * POR QUÉ. Todo dato del panel entra por un Server Action, que es un POST: el
 * service worker no lo puede cachear y sin red no hay NADA que mostrar. Encima
 * React Query arranca con el cache vacío en cada apertura de la PWA, así que
 * reabrir la app en una zona sin señal daba pantalla en blanco aunque los
 * datos hubieran estado ahí un minuto antes. En el mostrador eso es no poder
 * ni consultar un precio.
 *
 * QUÉ SE GUARDA, Y QUÉ NO. Solo catálogo: productos del POS e Inventario. NO
 * se guarda nada que sea PLATA —caja, turnos, saldos de cuenta corriente— y
 * eso es deliberado: una foto vieja de un saldo no es un dato incompleto, es
 * un dato equivocado, y alguien la usa para cobrar. El catálogo, en cambio,
 * envejece de una forma que se puede mostrar en pantalla ("precios de hace 12
 * minutos") y con la que se puede trabajar.
 *
 * POR NEGOCIO. Cada comercio guarda su propia entrada: el mismo celular puede
 * tener dos, y mezclarlos sería mostrar el catálogo del otro.
 *
 * Se borra al cerrar sesión (`borrarCacheOffline`). En un dispositivo
 * compartido, el catálogo del comercio no puede quedar accesible después de
 * que la vendedora se fue.
 *
 * Mismo patrón que `features/purchases/lib/merge-draft-db.ts`, que ya guarda
 * el borrador de conciliación de remitos.
 */

const DB_NAME = "comerz-cache-offline";
const STORE_NAME = "react-query";
const DB_VERSION = 1;

/** Más viejo que esto no se restaura: el catálogo de la semana pasada no
 * ayuda a vender y sí puede confundir. Se vuelve a pedir a la red. */
const VENCIMIENTO_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheGuardado = {
  negocioId: string;
  /** El resultado de `dehydrate()` de React Query. La forma la define la
   * librería y no la interpretamos: entra y sale igual. */
  estado: unknown;
  guardadoEn: number;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> | null {
  // En SSR no hay IndexedDB, y en Safari con almacenamiento bloqueado tampoco.
  // Sin base, todo lo de abajo devuelve null y la app funciona como antes.
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "negocioId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function leerCacheOffline(
  negocioId: string,
): Promise<CacheGuardado | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const guardado = (await db.get(STORE_NAME, negocioId)) as
      | CacheGuardado
      | undefined;
    if (!guardado) return null;

    if (Date.now() - guardado.guardadoEn > VENCIMIENTO_MS) {
      await db.delete(STORE_NAME, negocioId);
      return null;
    }

    return guardado;
  } catch {
    // Leer el cache no puede romper la app: sin él se pide todo a la red,
    // que es exactamente como funcionaba antes.
    return null;
  }
}

export async function guardarCacheOffline(
  negocioId: string,
  estado: unknown,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put(STORE_NAME, {
      negocioId,
      estado,
      guardadoEn: Date.now(),
    } satisfies CacheGuardado);
  } catch {
    // Igual que arriba: en Safari con almacenamiento lleno esto tira, y no
    // puede llevarse puesta la pantalla que el usuario está usando.
  }
}

export async function borrarCacheOffline(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.clear(STORE_NAME);
  } catch {
    // Idem.
  }
}
