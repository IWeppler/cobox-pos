import { createHash } from "node:crypto";
import type { FilaImport } from "./parse-productos-csv";

/**
 * Huella del CONTENIDO de una planilla, para detectar que el mismo archivo se
 * está importando dos veces.
 *
 * Se calcula sobre las filas ya parseadas, no sobre los bytes del archivo, a
 * propósito: la misma planilla exportada como CSV y como XLSX, o guardada de
 * nuevo con otro fin de línea o otro encoding, es el MISMO import y tiene que
 * dar el mismo hash. Al revés también importa: cambiar una cantidad cambia el
 * hash, que es cuando sí querés poder volver a importar.
 *
 * Serialización estable: campos en orden fijo y claves de `atributos`
 * ordenadas, para que dos corridas del mismo archivo no dependan del orden en
 * que el parser haya poblado el objeto.
 */
export function hashPlanillaProductos(filas: FilaImport[]): string {
  const normalizadas = filas.map((f) => [
    f.fila,
    f.categoria ?? "",
    f.codigoBarras ?? "",
    f.producto,
    Object.entries(f.atributos)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("|"),
    f.stock,
    f.imei ?? "",
    f.precioCosto ?? "",
    f.precioVenta ?? "",
  ]);

  return createHash("sha256")
    .update(JSON.stringify(normalizadas))
    .digest("hex");
}
