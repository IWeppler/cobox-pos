import type { Producto } from "@/entities/productos/types";
import { parseRawVariantString } from "@/entities/productos/lib/parse-variant-attributes";
import type { Opcion, VarianteInput } from "../types";

/**
 * Normaliza nombre/valor de atributo para el cálculo de la key: case e
 * tilde-insensitive. Sin esto, la misma combinación reconstruida por dos
 * caminos distintos (relación normalizada en producto_variante_valores vs.
 * fallback al jsonb `atributos`, que puede traer casing/acentos legacy)
 * produce keys diferentes — la fila se ve igual en pantalla pero el hook
 * la trata como una combinación nueva, con stock en blanco, y el próximo
 * guardado la reinserta pisando el stock real con 0.
 */
function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function buildVariantKey(values: Record<string, string>) {
  return Object.entries(values)
    .map(
      ([key, value]) =>
        [normalizeKeyPart(key), normalizeKeyPart(value)] as const,
    )
    .filter(([key, value]) => key !== "" && value !== "")
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

/**
 * "Producto sin variantes reales": la fila placeholder que representa al
 * producto simple.
 *
 * Se compara SIN tildes y case-insensitive a propósito, porque el nombre se
 * escribe distinto según por dónde entró el producto y las dos formas son
 * válidas en la base:
 *
 *   - creación manual (create-product.ts / edit-product.ts) -> "Único"
 *   - remitos y carga rápida (merge-purchase.ts, aprobar_orden_compra) -> "Unico"
 *
 * Comparar contra el literal con tilde hacía que todo producto creado desde
 * un remito pareciera tener variantes: el formulario de edición abría la
 * sección de variantes con una sola fila fantasma "Unico".
 *
 * Acá se normaliza solo para LEER — el texto guardado no se toca nunca (misma
 * regla que productos_stock).
 */
export function esNombreVarianteUnica(
  nombre: string | null | undefined,
): boolean {
  if (!nombre) return false;

  const crudo = nombre.trim().toLowerCase();
  // "Ãšnico" es el mojibake de "Único" leído como Latin-1; está en datos
  // viejos y hay que seguir reconociéndolo. Se compara antes de sacar
  // tildes porque al normalizarlo queda "asnico", no "unico".
  if (crudo === "ãšnico") return true;

  const sinTildes = crudo.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return sinTildes === "unico";
}

function isPlaceholderVariant(variante: ProductoVarianteDb) {
  return esNombreVarianteUnica(variante.nombre_display);
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

/** Fallback para productos viejos que solo tienen el string plano de `productos_stock`. */
function fromLegacyStock(producto: Producto): VarianteInput[] {
  if (!producto.stock || producto.stock.length === 0) return [];

  return producto.stock
    .map((stockItem) => {
      const valores = parseRawVariantString(stockItem.variante);
      if (Object.keys(valores).length === 0) return null;

      return {
        key: buildVariantKey(valores) || stockItem.variante,
        valores,
        stock: stockItem.cantidad.toString(),
        precio: "",
        precio_costo: "",
        sku: "",
      };
    })
    .filter((v): v is VarianteInput => v !== null);
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
  return producto.stock?.length === 1 && esNombreVarianteUnica(variantName);
}

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
