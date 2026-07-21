import {
  normalizarParaComparar,
  parseRawVariantString,
} from "./parse-variant-attributes";
import { compararTalles } from "./comparar-talles";

/**
 * Forma mínima que necesitan estas funciones — deliberadamente más chica
 * que `ProductoVariante`/`Producto` completos, así también aceptan
 * `ProductoIndice` (la versión liviana de /stock, ver
 * features/stock/actions/get-product.ts) sin castear nada.
 */
interface VarianteConAtributos {
  stock?: number;
  nombre_display?: string;
  atributos?: Record<string, string>;
  producto_variante_valores?: {
    atributo?: { nombre?: string | null } | null;
    atributo_valor?: { valor?: string | null } | null;
  }[];
}

interface ProductoConVariantes {
  producto_variantes?: VarianteConAtributos[];
  /** `variante` solo se lee bajo `incluirStockLegacy` (catálogo público);
   * queda opcional porque ProductoIndice (uso de /stock) no la trae. */
  stock?: { variante?: string; cantidad: number }[];
}

export interface ResolverAtributosOptions {
  incluirFallbackRelacional?: boolean;
}

export function resolverAtributosVariante(
  variante: VarianteConAtributos,
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
  productos: ProductoConVariantes[],
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
      if (ocultarSinStock && (variante.stock ?? 0) <= 0) return;

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
        const parsed = parseRawVariantString(s.variante ?? "");
        Object.entries(parsed).forEach(([propiedad, valor]) =>
          addValor(propiedad, valor),
        );
      });
    }
  });

  // Orden fijo de propiedades: Género > Talle > Color. Cualquier otra
  // propiedad (Opción, Propiedad N, etc.) va después, alfabética entre sí
  // — mismo criterio que ya usa product-detail.tsx para la ficha de
  // producto del catálogo público.
  const ORDEN_PRIORIDAD: Record<string, number> = {
    genero: 0,
    talle: 1,
    color: 2,
  };

  const result: Record<string, string[]> = {};
  Object.values(propsMap)
    .sort((a, b) => {
      const pa = ORDEN_PRIORIDAD[normalizarParaComparar(a.label)] ?? 99;
      const pb = ORDEN_PRIORIDAD[normalizarParaComparar(b.label)] ?? 99;
      return pa - pb || a.label.localeCompare(b.label);
    })
    .forEach(({ label, valores }) => {
      const esTalle = normalizarParaComparar(label) === "talle";
      const valoresArray = Array.from(valores.values());
      result[label] = esTalle
        ? valoresArray.sort(compararTalles)
        : valoresArray.sort();
    });

  return result;
}
