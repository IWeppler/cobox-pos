import { parseFechaDDMMYYYY } from "@/features/clients/lib/parse-fecha-vencimiento";

// Normaliza un header para comparar: trim + lowercase + colapsa espacios
// y guiones (- _) a nada, así "deuda inicial", "deuda_inicial" y
// "deuda-inicial" matchean igual sin importar cómo haya exportado la
// planilla de origen (Excel/Sheets varían en esto).
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "")
    .replace(/[\s\-_]+/g, "");
}

// Única fuente de verdad de qué headers cuentan como "columna nombre":
// la usan tanto la búsqueda cruda de cabecera como el match exacto
// post-split más abajo.
const ALIASES_NOMBRE = ["nombre", "cliente"].map(normalizeHeader);
const ALIASES_TELEFONO = ["telefono", "tel"].map(normalizeHeader);
const ALIASES_DNI = ["dni", "documento"].map(normalizeHeader);
const ALIASES_DEUDA = ["deuda_inicial", "deuda", "saldo"].map(normalizeHeader);
// Match por substring (no exacto): variantes reales como "fecha de
// vencimiento" traen palabras intermedias ("de") que un alias exacto no
// cubre. "vencimiento" alcanza como ancla porque es la palabra distintiva
// de esta columna.
const ALIASES_VENCIMIENTO = ["vencimiento"].map(normalizeHeader);

export interface ClienteCSV {
  nombre: string;
  telefono: string;
  dni: string | null;
  deudaInicial: number;
  fechaVencimientoDeuda: string | null;
}

export interface ParseClientesCSVResult {
  error: string | null;
  clientes: ClienteCSV[];
  // Cantidad de filas de datos encontradas (más allá de si tenían nombre
  // válido) — para que el caller pueda distinguir "archivo sin filas" de
  // "0 clientes importados por otra razón" igual que antes del refactor.
  totalFilas: number;
  debug: {
    separator: string;
    headers: string[];
    idxNombre: number;
    headerPreview: string;
  } | null;
}

function limpiarCampo(v: string | undefined): string {
  return v?.trim().replace(/^["']|["']$/g, "") ?? "";
}

/**
 * Parsea el texto crudo de un CSV/TSV de clientes a una lista de
 * candidatos a insertar. Pura (sin llamadas a Supabase) para poder
 * testear la detección de headers/separador sin necesitar auth ni DB.
 */
export function parseClientesCSV(text: string): ParseClientesCSVResult {
  // Quitar el BOM de UTF-8 si el archivo lo trae (típico de exports de Excel).
  const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return {
      error: "El archivo está vacío o no tiene el formato válido.",
      clientes: [],
      totalFilas: 0,
      debug: null,
    };
  }

  let headerIdx = -1;
  let separator = ",";

  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase();
    if (ALIASES_NOMBRE.some((alias) => lowerLine.includes(alias))) {
      headerIdx = i;
      // Detectar separador: tab (pegado desde Excel/Sheets), punto y
      // coma (export es-AR de Sheets), o coma por defecto.
      if (lines[i].includes("\t")) separator = "\t";
      else if (lines[i].includes(";")) separator = ";";
      else separator = ",";
      break;
    }
  }

  if (headerIdx === -1) {
    const preview = lines
      .slice(0, 2)
      .map((l) => JSON.stringify(l))
      .join(" | ");
    console.error(
      `[parseClientesCSV] Columna 'nombre' no encontrada. Primeras líneas crudas recibidas: ${preview}`,
    );
    return {
      error: `No se encontró la columna 'nombre' en el archivo. Primeras líneas leídas: ${preview}`,
      clientes: [],
      totalFilas: 0,
      debug: null,
    };
  }

  const rows = lines.slice(headerIdx).map((line) => line.split(separator));
  const headers = rows[0].map(normalizeHeader);

  const idxNombre = headers.findIndex((h) => ALIASES_NOMBRE.includes(h));
  const idxTel = headers.findIndex((h) => ALIASES_TELEFONO.includes(h));
  const idxDni = headers.findIndex((h) => ALIASES_DNI.includes(h));
  const idxDeuda = headers.findIndex((h) => ALIASES_DEUDA.includes(h));
  const idxVencimiento = headers.findIndex((h) =>
    ALIASES_VENCIMIENTO.some((alias) => h.includes(alias)),
  );

  const clientes: ClienteCSV[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length <= idxNombre || !row[idxNombre]) continue;

    const nombre = limpiarCampo(row[idxNombre]);
    if (!nombre) continue;

    const telefono = idxTel !== -1 ? limpiarCampo(row[idxTel]) : "";
    const dni = idxDni !== -1 ? limpiarCampo(row[idxDni]) : null;

    // 🚀 Limpieza exhaustiva de números de deuda (por si trae comillas o signos pesos)
    let deudaInicial = 0;
    if (idxDeuda !== -1 && row[idxDeuda]) {
      const rawDeuda = row[idxDeuda]
        .replace(/^["']|["']$/g, "")
        .replace(/[^0-9,-]+/g, "")
        .replace(",", ".");
      deudaInicial = parseFloat(rawDeuda) || 0;
    }

    const fechaVencimientoDeuda =
      idxVencimiento !== -1 && row[idxVencimiento]
        ? parseFechaDDMMYYYY(row[idxVencimiento])
        : null;

    clientes.push({ nombre, telefono, dni, deudaInicial, fechaVencimientoDeuda });
  }

  const headerPreview = lines
    .slice(headerIdx, headerIdx + 2)
    .map((l) => JSON.stringify(l))
    .join(" | ");

  return {
    error: null,
    clientes,
    totalFilas: rows.length - 1,
    debug: { separator, headers, idxNombre, headerPreview },
  };
}
