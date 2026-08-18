import type { FilaImport } from "./parse-productos-csv";

/**
 * Convierte las filas de una planilla propia en líneas de remito.
 *
 * Es la pieza que unifica el ingreso de mercadería: hasta acá la planilla
 * escribía derecho en el stock y el remito pasaba por conciliación, así que
 * eran dos caminos con dos motores y dos formas de equivocarse. Con esto los
 * dos terminan en la misma pantalla de verificación.
 *
 * Que la planilla también se concilie NO es burocracia: con 300 productos
 * cargados, la pregunta "esta remera blanca talle M de Levis, ¿ya la tengo o
 * la cargué escrita distinto?" no la puede contestar el comercio de memoria, y
 * es exactamente la que produce el catálogo duplicado. Da igual quién escribió
 * el archivo — lo que importa es si el producto ya existe.
 *
 * Puro: recibe filas parseadas y devuelve líneas. El matching contra el
 * catálogo lo hace después la conciliación, que es donde ya vive.
 */

export interface LineaRemito {
  raw_nombre: string;
  raw_variante: string;
  raw_categoria: string | null;
  raw_sku: string | null;
  raw_marca: string | null;
  raw_genero: string | null;
  raw_imei: string | null;
  cantidad: number;
  precio_costo: number;
  precio_venta: number | null;
}

/**
 * El texto de variante que ve la conciliación: "Talle: M / Color: Negro".
 *
 * Va CON etiqueta, no con los valores pelados, y esa es la diferencia entre
 * que los atributos lleguen a la base o se pierdan. La conciliación lee este
 * texto con `parseVarianteAtributos`, que parte por " / " y descarta todo
 * segmento sin ":" (parse-variant-attributes.ts) — o sea que un "M / Negro"
 * llegaba a `producto_variantes.atributos` como `{}`. La variante quedaba sin
 * talle ni color, invisible para los filtros y para el selector del POS, y
 * `aprobar_orden_compra` además pisaba con ese `{}` los atributos de la
 * variante que ya existía.
 *
 * Es el mismo formato que ya produce el remito de proveedor
 * (`conGeneroAgregado` en create-purchase.ts): un solo vocabulario para los
 * dos orígenes, que es la razón de ser de la conciliación única.
 *
 * Sin atributos devuelve "Unico" —no cadena vacía— porque es el mismo valor
 * que usa el resto del sistema para el producto sin variantes, y una variante
 * vacía se guardaría como una variante más.
 */
export function varianteDesdeAtributos(
  atributos: Record<string, string>,
): string {
  const segmentos = Object.entries(atributos)
    .map(([nombre, valor]) => [nombre.trim(), valor.trim()] as const)
    .filter(([nombre, valor]) => nombre && valor)
    .map(([nombre, valor]) => `${nombre}: ${valor}`);

  return segmentos.length > 0 ? segmentos.join(" / ") : "Unico";
}

export function planillaALineasDeRemito(filas: FilaImport[]): LineaRemito[] {
  return filas.map((fila) => ({
    raw_nombre: fila.producto.trim(),
    raw_variante: varianteDesdeAtributos(fila.atributos),
    raw_categoria: fila.categoria?.trim() || null,
    // El código de barras entra como SKU, que es la columna donde el sistema
    // lo guarda (producto_variantes.sku es EAN en electro — misma columna,
    // otro label).
    raw_sku: fila.codigoBarras?.trim() || null,
    raw_marca: fila.marca?.trim() || null,
    // El género de la planilla resuelve la categoría PADRE (Hombre > Camperas,
    // Nena > Remeras): `resolverCategoriaImport` cruza este eje con el tipo de
    // prenda que sale del nombre. Estaba fijo en null, así que una planilla
    // propia entraba sin ese eje y la fila caía sin categoría —o peor, en la
    // subcategoría de otra audiencia, que es el único "Remeras" que encuentra.
    raw_genero: fila.genero?.trim() || null,
    raw_imei: fila.imei?.trim() || null,
    cantidad: fila.stock,
    precio_costo: fila.precioCosto ?? 0,
    precio_venta: fila.precioVenta,
  }));
}

/**
 * Qué va a pasar con la planilla, para mostrarlo ANTES de crear el remito.
 *
 * Las unidades no son la cantidad de filas: una planilla de electro tiene una
 * fila por aparato, así que 20 filas pueden ser 20 unidades de 3 modelos.
 * Decir "20 productos" ahí sería mentir.
 */
export interface ResumenPlanilla {
  filas: number;
  productos: number;
  unidades: number;
  conImei: number;
  sinPrecioVenta: number;
}

export function resumirPlanilla(filas: FilaImport[]): ResumenPlanilla {
  return {
    filas: filas.length,
    productos: new Set(filas.map((f) => f.producto.trim().toLowerCase())).size,
    unidades: filas.reduce((suma, f) => suma + f.stock, 0),
    conImei: filas.filter((f) => f.imei).length,
    // Una fila sin precio de venta no se puede crear como producto nuevo: se
    // avisa antes de subir, no después de conciliar.
    sinPrecioVenta: filas.filter((f) => !f.precioVenta || f.precioVenta <= 0)
      .length,
  };
}
