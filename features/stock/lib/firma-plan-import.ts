import { createHash } from "node:crypto";
import type { ItemPlan, PlanImport } from "./import-productos-plan";

/**
 * Firma del plan de importación: lo que el usuario aprobó en la preview.
 *
 * El problema que resuelve: la preview arma el plan contra una foto del
 * catálogo, el usuario la mira, y recién después aprieta importar. Entre esos
 * dos momentos otra persona (u otra pestaña) puede haber creado el producto,
 * cargado el IMEI o agregado la variante. Al confirmar, el plan se recalcula
 * contra el catálogo de ESE momento, así que lo que se escribe puede no ser
 * lo que se aprobó: la fila que decía "producto nuevo" pasa a sumar stock a
 * un producto ajeno, o al revés.
 *
 * La firma viaja del server al cliente en la preview y vuelve con el
 * confirmar. Si no coincide con la del plan recalculado, no se escribe nada y
 * se devuelve el plan nuevo con las filas que cambiaron marcadas.
 *
 * Solo firma lo que decide QUÉ se escribe (acción, destino, categoría,
 * unidades y si la fila está bloqueada). Los avisos quedan afuera a
 * propósito: cambian de texto sin cambiar lo que pasa en la base, y hacer
 * repetir la aprobación por eso entrena a aprobar sin leer.
 *
 * El archivo no se firma aparte: el plan se recalcula a partir de las mismas
 * filas que manda el cliente, así que un archivo distinto da un plan distinto
 * y la firma no coincide igual.
 *
 * Node-only (`node:crypto`): la firma la calcula SIEMPRE el server. El
 * cliente la recibe y la devuelve tal cual, nunca la produce.
 */

export const VERSION_FIRMA_PLAN = 1;

export interface FirmaPlanImport {
  version: number;
  /** sha256 de todo el plan. Camino rápido: si coincide, no hay nada que comparar. */
  hash: string;
  /** Número de fila -> huella corta de su decisión. Sirve para el diff. */
  filas: Record<string, string>;
}

/** Lo único que decide qué se escribe de esta fila. */
function decisionDeFila(item: ItemPlan): string {
  return [
    item.accion,
    item.productoId ?? "",
    item.varianteId ?? "",
    item.categoriaId ?? "",
    item.stock,
    item.imei ?? "",
    item.errores.length > 0 ? "BLOQUEADA" : "OK",
  ].join("|");
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function firmarPlanImport(plan: PlanImport): FirmaPlanImport {
  const filas: Record<string, string> = {};

  for (const item of plan.items) {
    // 8 hex = 32 bits. La comparación es fila contra la MISMA fila, no todas
    // contra todas, así que no aplica la paradoja del cumpleaños.
    filas[String(item.fila)] = sha256(decisionDeFila(item)).slice(0, 8);
  }

  const hash = sha256(
    [
      VERSION_FIRMA_PLAN,
      plan.items.length,
      ...plan.items.map((i) => `${i.fila}:${filas[String(i.fila)]}`),
    ].join("\n"),
  );

  return { version: VERSION_FIRMA_PLAN, hash, filas };
}

/** true = el plan cambió desde que se aprobó, o la firma no es comparable. */
export function firmaDesactualizada(
  aprobada: FirmaPlanImport | null | undefined,
  actual: FirmaPlanImport,
): boolean {
  if (!aprobada) return true;
  if (aprobada.version !== actual.version) return true;
  return aprobada.hash !== actual.hash;
}

/**
 * Filas cuya decisión cambió, ordenadas. Incluye las que aparecen en una
 * firma y no en la otra: que se agregue o desaparezca una fila también es
 * un cambio del plan.
 */
export function filasQueCambiaron(
  aprobada: FirmaPlanImport | null | undefined,
  actual: FirmaPlanImport,
): number[] {
  if (!aprobada) return [];

  const numeros = new Set<string>([
    ...Object.keys(aprobada.filas),
    ...Object.keys(actual.filas),
  ]);

  return [...numeros]
    .filter((fila) => aprobada.filas[fila] !== actual.filas[fila])
    .map(Number)
    .sort((a, b) => a - b);
}
