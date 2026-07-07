import type { Producto } from "@/entities/productos/types";
import {
  normalizarParaComparar,
  parseRawVariantString,
} from "./parse-variant-attributes";

type ProductoVarianteDb = NonNullable<Producto["producto_variantes"]>[number];

export interface ResolverAtributosOptions {
  incluirFallbackRelacional?: boolean;
}

export function resolverAtributosVariante(
  variante: ProductoVarianteDb,
  options: ResolverAtributosOptions = {},
): Record<string, string> {
  if (variante.atributos && Object.keys(variante.atributos).length > 0) {
    return variante.atributos;
  }

  if (options.incluirFallbackRelacional) {
    const atributos: Record<string, string> = {};
    variante.producto_variante_valores?.forEach((relacion) => {
      const propiedad = relacion.atributo?.nombre?.trim();
      const valor = relacion.atributo_valor?.valor?.trim();
      if (propiedad && valor) atributos[propiedad] = valor;
    });
    if (Object.keys(atributos).length > 0) return atributos;
  }

  if (variante.nombre_display) {
    return parseRawVariantString(variante.nombre_display);
  }

  return {};
}

export interface BuildPropiedadesFiltroOptions extends ResolverAtributosOptions {
  /** Excluye variantes/stock en 0 al armar los grupos (catálogo público). */
  ocultarSinStock?: boolean;
  incluirStockLegacy?: boolean;
}

export function buildPropiedadesFiltro(
  productos: Producto[],
  options: BuildPropiedadesFiltroOptions = {},
): Record<string, string[]> {
  const {
    ocultarSinStock = false,
    incluirFallbackRelacional = false,
    incluirStockLegacy = false,
  } = options;

  const propsMap: Record<string, { label: string; valores: Map<string, string> }> =
    {};

  const addValor = (propiedadRaw: string, valorRaw: string) => {
    const propiedad = propiedadRaw?.trim();
    const valor = valorRaw?.trim();
    if (!propiedad || !valor) return;

    const clavePropNormalizada = normalizarParaComparar(propiedad);
    if (!propsMap[clavePropNormalizada]) {
      propsMap[clavePropNormalizada] = { label: propiedad, valores: new Map() };
    }

    // Mismo criterio que la propiedad: "NEGRO" y "Negro" son el mismo
    // valor. Se conserva el casing de la primera aparición como display.
    const claveValorNormalizada = normalizarParaComparar(valor);
    const valoresMap = propsMap[clavePropNormalizada].valores;
    if (!valoresMap.has(claveValorNormalizada)) {
      valoresMap.set(claveValorNormalizada, valor);
    }
  };

  productos.forEach((producto) => {
    let tieneAtributosEstructurados = false;

    producto.producto_variantes?.forEach((variante) => {
      if (ocultarSinStock && variante.stock <= 0) return;

      const atributos = resolverAtributosVariante(variante, {
        incluirFallbackRelacional,
      });
      if (Object.keys(atributos).length > 0) tieneAtributosEstructurados = true;
      Object.entries(atributos).forEach(([propiedad, valor]) =>
        addValor(propiedad, valor),
      );
    });

    if (incluirStockLegacy && !tieneAtributosEstructurados) {
      producto.stock?.forEach((s) => {
        if (ocultarSinStock && s.cantidad <= 0) return;
        const parsed = parseRawVariantString(s.variante);
        Object.entries(parsed).forEach(([propiedad, valor]) =>
          addValor(propiedad, valor),
        );
      });
    }
  });

  const result: Record<string, string[]> = {};
  Object.values(propsMap)
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(({ label, valores }) => {
      result[label] = Array.from(valores.values()).sort();
    });

  return result;
}
