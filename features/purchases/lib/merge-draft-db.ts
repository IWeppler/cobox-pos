import { openDB, type IDBPDatabase } from "idb";
import { ItemResuelto } from "@/entities/compras/types";
import { Producto } from "@/entities/productos/types";

const DB_NAME = "comerz-purchases-drafts";
const STORE_NAME = "merge-drafts";
const DB_VERSION = 1;

export interface MergeDraft {
  ordenId: string;
  items: ItemResuelto[];
  // Productos creados "al vuelo" durante la conciliación que todavía no
  // estaban en el prop `productos` original — hace falta guardarlos aparte
  // para poder resolver sus nombres/precios al restaurar el borrador.
  productosCreados: Producto[];
  actualizadoEn: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "ordenId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getMergeDraft(
  ordenId: string,
): Promise<MergeDraft | null> {
  const db = await getDb();
  if (!db) return null;
  const draft = await db.get(STORE_NAME, ordenId);
  return (draft as MergeDraft) ?? null;
}

export async function saveMergeDraft(draft: MergeDraft): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.put(STORE_NAME, draft);
}

export async function deleteMergeDraft(ordenId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(STORE_NAME, ordenId);
}
