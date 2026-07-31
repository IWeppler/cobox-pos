import { slugify } from "@/shared/utils/slugify";
import type { FilaImport } from "./parse-productos-csv";

/**
 * Tipos y matching del import de productos. Puro (sin Supabase) para poder
 * testear las reglas de "esta fila crea, agrega variante o suma stock" con
 * un catálogo de mentira. Vive fuera de las actions porque tanto el modal
 * (cliente) como las dos actions (server) importan estos tipos, y un
 * archivo "use server" no puede exportar tipos para el cliente.
 */

/**
 * Tope de filas por import. Un archivo más grande que esto es un error de
 * armado (una planilla entera pegada dos veces) más seguido que un caso
 * real, y evita traer el catálogo entero para comparar contra un archivo
 * gigante.
 */
export const MAX_FILAS_IMPORT = 3000;

export type AccionImport =
  | "CREAR_PRODUCTO"
  | "CREAR_VARIANTE"
  | "SUMAR_STOCK";

/** Foto mínima del catálogo actual contra la que se resuelve cada fila. */
export interface VarianteExistente {
  id: string;
  productoId: string;
  sku: string | null;
  atributos: Record<string, string> | null;
  /** Hace falta para sincronizar el espejo legacy productos_stock, que se
   * relaciona por (producto_id, nombre de variante) y no por variante_id. */
  nombreDisplay?: string;
}

export interface ProductoExistente {
  id: string;
  nombre: string;
}

export interface CategoriaExistente {
  id: string;
  nombre: string;
  slug: string;
}

export interface CatalogoActual {
  productos: ProductoExistente[];
  variantes: VarianteExistente[];
  categorias: CategoriaExistente[];
  /** IMEIs ya cargados en unidades_serie. */
  imeisExistentes: Set<string>;
}

export interface ItemPlan {
  fila: number;
  producto: string;
  atributos: Record<string, string>;
  imei: string | null;
  /** Unidades que suma esta fila. Con IMEI siempre 1 (lo fuerza el parser). */
  stock: number;
  precioCosto: number | null;
  precioVenta: number | null;
  codigoBarras: string | null;

  accion: AccionImport;
  productoId: string | null;
  varianteId: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;

  /** Bloquean la fila: no se escribe nada de ella. */
  errores: string[];
  /** La fila se importa igual, pero con una decisión que conviene mirar. */
  avisos: string[];
}

export interface PlanImport {
  items: ItemPlan[];
  resumen: {
    productosNuevos: number;
    variantesNuevas: number;
    filasQueSumanStock: number;
    unidadesSerie: number;
    unidadesTotales: number;
    filasConError: number;
  };
}

/** Clave de comparación de nombre de producto: sin tildes, sin casing, sin puntuación. */
export function claveProducto(nombre: string): string {
  return slugify(nombre);
}

/**
 * Clave de comparación de una combinación de atributos. Ordena las claves
 * para que {Color, Memoria} y {Memoria, Color} den lo mismo, y normaliza
 * nombre y valor sin tildes ni casing.
 *
 * Además colapsa los separadores del slug ("128 gb" y "128GB" dan
 * "128gb"): en una planilla tipeada a mano el espacio es ruido, no
 * información. Eso hace este matching MÁS laxo que el de
 * normalizarAtributoKeyValor, que sí conserva el guion. Es a propósito y
 * seguro en una dirección: al ser más laxo encuentra la variante existente
 * y suma stock, en vez de crear un duplicado "128 GB" al lado de "128GB".
 * Como la misma función se aplica a los dos lados de la comparación (fila
 * del archivo y variante de la base), no puede desincronizarse.
 *
 * Un objeto vacío devuelve "" (la variante "Único" de un producto simple).
 */
export function claveAtributos(
  atributos: Record<string, string> | null | undefined,
): string {
  if (!atributos) return "";
  return Object.entries(atributos)
    .map(
      ([k, v]) =>
        [
          slugify(k).replaceAll("-", ""),
          slugify(String(v)).replaceAll("-", ""),
        ] as const,
    )
    .filter(([k, v]) => k !== "" && v !== "")
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

/**
 * Resuelve cada fila contra el catálogo actual y contra las filas
 * anteriores del mismo archivo.
 *
 * Reglas, en orden:
 *
 *  1. Si la fila trae codigo_barras y ese SKU ya existe en una variante,
 *     ESA es la variante destino — el código de barras identifica mejor
 *     que el nombre tipeado. Si además el nombre no coincide, avisa.
 *  2. Si no, se busca el producto por nombre. Si existe, se busca dentro
 *     de él la variante con la misma combinación de atributos.
 *  3. Lo que no se encuentra, se crea.
 *
 * Las filas anteriores del archivo cuentan como catálogo: dos filas del
 * mismo producto nuevo generan UN producto con dos variantes, no dos
 * productos.
 */
export function construirPlanImport(
  filas: FilaImport[],
  catalogo: CatalogoActual,
): PlanImport {
  const productosPorClave = new Map(
    catalogo.productos.map((p) => [claveProducto(p.nombre), p.id]),
  );
  const nombrePorProductoId = new Map(
    catalogo.productos.map((p) => [p.id, p.nombre]),
  );
  const variantePorSku = new Map(
    catalogo.variantes
      .filter((v) => v.sku)
      .map((v) => [slugify(v.sku as string), v]),
  );
  const variantePorProductoYAtributos = new Map(
    catalogo.variantes.map((v) => [
      `${v.productoId}::${claveAtributos(v.atributos)}`,
      v,
    ]),
  );
  const categoriasPorClave = new Map(
    catalogo.categorias.map((c) => [claveProducto(c.nombre), c]),
  );

  // Estado acumulado del propio archivo: productos y variantes que todavía
  // no existen en la base pero que una fila anterior ya decidió crear.
  const productosNuevosPorClave = new Map<string, number>();
  const variantesNuevas = new Set<string>();
  const imeisEnArchivo = new Map<string, number>();

  const items: ItemPlan[] = [];

  for (const fila of filas) {
    const errores: string[] = [];
    const avisos: string[] = [];

    // --- Categoría -------------------------------------------------------
    let categoriaId: string | null = null;
    let categoriaNombre: string | null = null;
    if (fila.categoria) {
      const cat = categoriasPorClave.get(claveProducto(fila.categoria));
      if (cat) {
        categoriaId = cat.id;
        categoriaNombre = cat.nombre;
      } else {
        // Mismo criterio que resolverCategoriaImport en el merge de
        // remitos: nunca se crea una categoría desde un archivo. Queda sin
        // categoría y se avisa.
        avisos.push(
          `La categoría "${fila.categoria}" no existe en el catálogo; el producto queda sin categoría.`,
        );
      }
    }

    // --- IMEI ------------------------------------------------------------
    if (fila.imei) {
      if (catalogo.imeisExistentes.has(fila.imei)) {
        errores.push(`El IMEI ${fila.imei} ya está cargado en el sistema.`);
      }
      const filaPrevia = imeisEnArchivo.get(fila.imei);
      if (filaPrevia !== undefined) {
        errores.push(
          `El IMEI ${fila.imei} está repetido en el archivo (ya aparece en la fila ${filaPrevia}).`,
        );
      } else {
        imeisEnArchivo.set(fila.imei, fila.fila);
      }
    }

    // --- Producto y variante destino -------------------------------------
    const clave = claveProducto(fila.producto);
    const claveAtrs = claveAtributos(fila.atributos);

    let accion: AccionImport;
    let productoId: string | null = null;
    let varianteId: string | null = null;

    const porSku = fila.codigoBarras
      ? variantePorSku.get(slugify(fila.codigoBarras))
      : undefined;

    if (porSku) {
      accion = "SUMAR_STOCK";
      productoId = porSku.productoId;
      varianteId = porSku.id;

      const nombreReal = nombrePorProductoId.get(porSku.productoId);
      if (nombreReal && claveProducto(nombreReal) !== clave) {
        avisos.push(
          `El código ${fila.codigoBarras} ya pertenece a "${nombreReal}"; se suma ahí y se ignora el nombre del archivo.`,
        );
      }
    } else {
      const idExistente = productosPorClave.get(clave);

      if (idExistente) {
        productoId = idExistente;
        const varianteExistente = variantePorProductoYAtributos.get(
          `${idExistente}::${claveAtrs}`,
        );
        if (varianteExistente) {
          accion = "SUMAR_STOCK";
          varianteId = varianteExistente.id;
        } else if (variantesNuevas.has(`${clave}::${claveAtrs}`)) {
          // Otra fila del mismo archivo ya decidió crear esta variante.
          accion = "SUMAR_STOCK";
        } else {
          accion = "CREAR_VARIANTE";
          variantesNuevas.add(`${clave}::${claveAtrs}`);
        }
      } else if (productosNuevosPorClave.has(clave)) {
        // El producto lo crea una fila anterior del mismo archivo.
        if (variantesNuevas.has(`${clave}::${claveAtrs}`)) {
          accion = "SUMAR_STOCK";
        } else {
          accion = "CREAR_VARIANTE";
          variantesNuevas.add(`${clave}::${claveAtrs}`);
        }
      } else {
        accion = "CREAR_PRODUCTO";
        productosNuevosPorClave.set(clave, fila.fila);
        variantesNuevas.add(`${clave}::${claveAtrs}`);
      }
    }

    // --- Precios ---------------------------------------------------------
    // productos.precio y precio_costo son NOT NULL, y un producto nuevo a
    // precio 0 es vendible a $0 en el POS: para crear hace falta precio de
    // venta sí o sí. Para sumar stock a algo que ya existe, no.
    const esProductoNuevo =
      accion === "CREAR_PRODUCTO" ||
      (productoId === null && accion === "CREAR_VARIANTE");

    if (esProductoNuevo && (fila.precioVenta === null || fila.precioVenta <= 0)) {
      errores.push(
        "Falta el precio de venta y el producto es nuevo (no se puede crear a $0).",
      );
    }
    if (esProductoNuevo && fila.precioCosto === null) {
      avisos.push("Sin precio de costo: se guarda en 0.");
    }
    if (!esProductoNuevo && fila.precioVenta !== null) {
      avisos.push(
        "El producto ya existe: se suma stock y NO se toca el precio actual.",
      );
    }

    items.push({
      fila: fila.fila,
      producto: fila.producto,
      atributos: fila.atributos,
      imei: fila.imei,
      stock: fila.stock,
      precioCosto: fila.precioCosto,
      precioVenta: fila.precioVenta,
      codigoBarras: fila.codigoBarras,
      accion,
      productoId,
      varianteId,
      categoriaId,
      categoriaNombre,
      errores,
      avisos,
    });
  }

  const validos = items.filter((i) => i.errores.length === 0);

  return {
    items,
    resumen: {
      productosNuevos: new Set(
        validos
          .filter((i) => i.accion === "CREAR_PRODUCTO")
          .map((i) => claveProducto(i.producto)),
      ).size,
      variantesNuevas: validos.filter((i) => i.accion === "CREAR_VARIANTE")
        .length,
      filasQueSumanStock: validos.filter((i) => i.accion === "SUMAR_STOCK")
        .length,
      unidadesSerie: validos.filter((i) => i.imei).length,
      unidadesTotales: validos.reduce((acc, i) => acc + i.stock, 0),
      filasConError: items.length - validos.length,
    },
  };
}
