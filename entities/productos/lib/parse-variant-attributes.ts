const DIACRITICOS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

export function capitalizar(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/** Compara claves ignorando mayúsculas/acentos (ej. "GÉNERO", "genero", "gÉnero" son la misma clave). */
export function normalizarParaComparar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(DIACRITICOS_REGEX, "")
    .trim()
    .toLowerCase();
}

/**
 * Parsea un segmento tipo "TALLE: S" en { nombre: "Talle", valor: "S" }.
 * Devuelve null si el segmento no tiene el patrón "CLAVE: VALOR" (ej. un
 * valor legacy suelto como "S" o "M" sin ninguna clave asociada) — el
 * caller decide el fallback para ese caso, nunca asumiendo una posición
 * fija (el bug que reemplaza esta función asumía que el primer segmento
 * sin etiqueta siempre era "Color").
 */
export function parseAttributeSegment(
  segment: string,
): { nombre: string; valor: string } | null {
  if (!segment) return null;

  const sepIndex = segment.indexOf(":");
  if (sepIndex === -1) return null;

  const keyRaw = segment.slice(0, sepIndex).trim();
  const valRaw = segment.slice(sepIndex + 1).trim();

  if (!keyRaw || !valRaw) return null;

  let nombre = capitalizar(keyRaw);
  const claveComparable = normalizarParaComparar(keyRaw);

  if (claveComparable === "genero") {
    nombre = "Género";
  } else if (claveComparable === "color") {
    nombre = "Color";
  } else if (claveComparable === "talle") {
    nombre = "Talle";
  }

  return { nombre, valor: valRaw };
}

/**
 * Parsea un string de variante legacy suelto (nombre_display de
 * producto_variantes, o variante de productos_stock) a un Record plano de
 * propiedad->valor. Única implementación en todo el repo: reemplaza dos
 * copias divergentes que existían antes (una en
 * features/store/hooks/use-catalog-filters.ts, otra en
 * features/stock/utils/parse-legacy-variant.ts) — la de use-catalog-filters
 * asumía ciegamente que, para un string de 2 partes sin etiqueta, la
 * primera parte era "Color" y la segunda "Talle". Eso mal-etiquetaba
 * variantes reales (ej. "Hombre / Negro" es Género/Color, no Color/Talle).
 * Acá cualquier segmento sin "CLAVE: VALOR" cae a "Propiedad N" según su
 * posición, sin adivinar qué representa.
 */
export function parseRawVariantString(raw: string): Record<string, string> {
  const v = raw?.trim() || "";
  if (!v || v.toLowerCase() === "unico" || v.toLowerCase() === "único")
    return {};

  const result: Record<string, string> = {};

  if (v.includes("|") && v.includes(":")) {
    v.split("|").forEach((part) => {
      const parsed = parseAttributeSegment(part);
      if (parsed) result[parsed.nombre] = parsed.valor;
    });
    return result;
  }

  if (v.includes("/") || v.includes("-")) {
    const separator = v.includes("/") ? "/" : "-";
    const parts = v.split(separator).map((p) => p.trim());

    parts.forEach((part, idx) => {
      const parsed = parseAttributeSegment(part);
      if (parsed) {
        result[parsed.nombre] = parsed.valor;
      } else {
        result[`Propiedad ${idx + 1}`] = part;
      }
    });
    return result;
  }

  const parsed = parseAttributeSegment(v);
  if (parsed) {
    result[parsed.nombre] = parsed.valor;
    return result;
  }

  result["Propiedad 1"] = v;
  return result;
}
