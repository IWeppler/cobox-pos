import * as XLSX from "xlsx";
import { decodeCsvBuffer } from "@/features/clients/lib/decode-csv-file";
import { csvARows } from "./parse-productos-csv";

/**
 * Lee un archivo elegido por el usuario y lo devuelve como matriz de
 * celdas, sea CSV/TSV o XLSX/XLS.
 *
 * Corre en el cliente a propósito: el archivo no viaja al server, viaja el
 * resultado ya parseado. Un XLSX de 3000 filas pesa mucho más que el JSON
 * de sus filas, y así el server action recibe siempre la misma forma sin
 * importar de qué formato salió.
 */
export async function leerPlanillaProductos(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const nombre = file.name.toLowerCase();

  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
    const libro = XLSX.read(buffer, { type: "array" });
    const primeraHoja = libro.SheetNames[0];
    if (!primeraHoja) return [];

    // `header: 1` devuelve matriz de filas en vez de objetos: el header lo
    // detecta parseProductosSheet, que tolera títulos arriba de la tabla.
    // `raw: false` hace que Excel formatee los números como los ve el
    // usuario, así parseNumeroLocal recibe "1.234,50" y no un float con
    // ruido de coma flotante. `defval: ""` mantiene alineadas las columnas
    // cuando hay celdas vacías en el medio.
    const rows = XLSX.utils.sheet_to_json<string[]>(libro.Sheets[primeraHoja], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    return rows.map((fila) => (fila ?? []).map((c) => (c == null ? "" : String(c))));
  }

  return csvARows(decodeCsvBuffer(buffer));
}
