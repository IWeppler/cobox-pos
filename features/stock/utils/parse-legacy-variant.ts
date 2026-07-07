import type { Producto } from "@/entities/productos/types";
import type { Opcion, VarianteInput } from "../types";

export function buildVariantKey(values: Record<string, string>) {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

/**
 * Datos legacy pueden traer el nombre de la propiedad incrustado en el
 * valor (ej: "TALLE: L" en vez de "L"). Esto pasaba cuando el valor se
 * guardaba concatenado antes de existir la tabla normalizada de atributos.
 */
function cleanAttributeValue(propName: string, rawValue: string): string {
  const value = rawValue.trim();
  const prefixPattern = new RegExp(
    `^${propName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`,
    "i",
  );
  return value.replace(prefixPattern, "").trim();
}

type ProductoVarianteDb = NonNullable<Producto["producto_variantes"]>[number];

function isPlaceholderVariant(variante: ProductoVarianteDb) {
  return variante.nombre_display === "Único";
}

/** Reconstruye las variantes desde la tabla normalizada `producto_variantes`. */
function fromProductoVariantes(producto: Producto): VarianteInput[] | null {
  const variantesDb = producto.producto_variantes;
  if (!variantesDb || variantesDb.length === 0) return null;
  if (variantesDb.length === 1 && isPlaceholderVariant(variantesDb[0])) {
    return null;
  }

  const variantes = variantesDb
    .map((variante) => {
      const valores: Record<string, string> = {};

      const relaciones = variante.producto_variante_valores ?? [];
      if (relaciones.length > 0) {
        for (const rel of relaciones) {
          const propName = rel.atributo?.nombre?.trim();
          const rawValue = rel.atributo_valor?.valor;
          if (propName && rawValue) {
            valores[propName] = cleanAttributeValue(propName, rawValue);
          }
        }
      } else if (variante.atributos) {
        for (const [propName, rawValue] of Object.entries(
          variante.atributos,
        )) {
          if (propName.trim() && rawValue) {
            valores[propName] = cleanAttributeValue(propName, rawValue);
          }
        }
      }

      if (Object.keys(valores).length === 0) return null;

      return {
        key: buildVariantKey(valores) || variante.id,
        valores,
        stock: (variante.stock ?? 0).toString(),
        precio: variante.precio?.toString() ?? "",
        precio_costo: variante.costo?.toString() ?? "",
        sku: variante.sku ?? "",
      };
    })
    .filter((v): v is VarianteInput => v !== null);

  return variantes.length > 0 ? variantes : null;
}

function capitalizar(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/** Compara claves ignorando mayúsculas/acentos (ej. "GÉNERO", "genero", "gÉnero" son la misma clave). */
const DIACRITICOS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

function normalizarParaComparar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(DIACRITICOS_REGEX, "")
    .trim()
    .toLowerCase();
}

/**
 * Parsea un segmento tipo "TALLE: S" en { nombre: "Talle", valor: "S" }.
 * Devuelve null si el segmento no tiene el patrón "CLAVE: VALOR" (ej. un
 * valor legacy suelto como "S" o "M" sin ninguna clave asociada).
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

function valsFromParts(parts: string[]) {
  return parts.map((segment, index) => {
    const parsed = parseAttributeSegment(segment);
    if (parsed) return [parsed.nombre, parsed.valor] as const;
    return [`Propiedad ${index + 1}`, segment.trim()] as const;
  });
}

/** Fallback para productos viejos que solo tienen el string plano de `productos_stock`. */
function fromLegacyStock(producto: Producto): VarianteInput[] {
  if (!producto.stock || producto.stock.length === 0) return [];

  return producto.stock.map((stockItem) => {
    const parts = stockItem.variante.split(" / ");
    const valores: Record<string, string> = {};

    if (parts.length > 1) {
      valsFromParts(parts).forEach(([key, value]) => {
        valores[key] = value;
      });
    } else {
      valores.Variante = cleanAttributeValue("Variante", parts[0]);
    }

    return {
      key: buildVariantKey(valores) || stockItem.variante,
      valores,
      stock: stockItem.cantidad.toString(),
      precio: "",
      precio_costo: "",
      sku: "",
    };
  });
}

function buildOpcionesFromVariantes(variantes: VarianteInput[]): Opcion[] {
  if (variantes.length === 0) return [];

  const propNames = Array.from(
    new Set(variantes.flatMap((v) => Object.keys(v.valores))),
  );

  return propNames.map((propName) => {
    const uniqueVals = Array.from(
      new Set(
        variantes
          .map((v) => v.valores[propName])
          .filter((v): v is string => Boolean(v)),
      ),
    );

    return {
      id: crypto.randomUUID(),
      nombre: propName,
      valores: uniqueVals,
    };
  });
}

export function isSingleVariantProduct(producto: Producto): boolean {
  if (
    producto.producto_variantes?.length === 1 &&
    isPlaceholderVariant(producto.producto_variantes[0])
  ) {
    return true;
  }

  if (producto.producto_variantes?.length) return false;

  const variantName = producto.stock?.[0]?.variante;
  return (
    producto.stock?.length === 1 &&
    (variantName === "Único" || variantName === "Ãšnico")
  );
}

/**
 * Reconstruye variantes y opciones para el formulario de edición.
 * Prioriza `producto_variantes` (nombres de atributo reales, ej. "Talle")
 * y solo recurre al string plano legacy de `productos_stock` para
 * productos que nunca se migraron a la tabla normalizada.
 */
export function parseLegacyVariant(
  producto: Producto,
  isSimpleProduct: boolean,
): { variantes: VarianteInput[]; opciones: Opcion[] } {
  if (isSimpleProduct) return { variantes: [], opciones: [] };

  const variantes =
    fromProductoVariantes(producto) ?? fromLegacyStock(producto);
  const opciones = buildOpcionesFromVariantes(variantes);

  return { variantes, opciones };
}
