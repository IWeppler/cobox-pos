import type { Rubro } from "@/entities/config/types";

/**
 * Plantilla CSV de la importación de productos.
 *
 * Existe porque "estas son las columnas" en un cartelito no alcanza: el
 * usuario arma la planilla en Excel y la primera importación se va en
 * columnas mal nombradas o en una fila por producto cuando el aparato lleva
 * IMEI. Bajar el archivo ya armado y reemplazar las filas de ejemplo saca
 * ese paso del medio.
 *
 * Las columnas son las mismas del parser (ver ALIASES en
 * parse-productos-csv.ts) y siempre se escriben con el nombre oficial. Lo que
 * cambia por rubro son los ejemplos: en electro cada aparato con IMEI va en
 * su propia fila, en indumentaria lo normal es color y cantidad.
 *
 * Puro y sin DOM: devuelve texto. La descarga la arma la UI.
 */

const COLUMNAS = [
  "categoria",
  "codigo_barras",
  "producto",
  "color",
  "memoria",
  "stock",
  "imei",
  "precio_costo",
  "precio_venta",
] as const;

const EJEMPLOS: Record<"electro" | "indumentaria", string[][]> = {
  // Dos filas del MISMO modelo con IMEI distinto: es la forma correcta de
  // cargar dos aparatos iguales, y la que nadie adivina sola.
  electro: [
    ["Celulares", "7791234567890", "Samsung Galaxy A15", "Negro", "128GB", "1", "356938035643809", "180000", "255000"],
    ["Celulares", "7791234567890", "Samsung Galaxy A15", "Negro", "128GB", "1", "356938035643810", "180000", "255000"],
    ["Televisores", "7799876543210", "Smart TV 50 4K", "", "", "4", "", "320000", "459000"],
  ],
  indumentaria: [
    ["Remeras", "", "Remera lisa algodón", "Negro", "", "12", "", "6000", "14900"],
    ["Remeras", "", "Remera lisa algodón", "Blanco", "", "8", "", "6000", "14900"],
    ["Pantalones", "", "Jean recto", "Azul", "", "5", "", "14000", "32900"],
  ],
};

/** Escapa una celda para CSV: comillas dobles solo si hace falta. */
function celda(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

export function plantillaImportProductos(rubro: Rubro): string {
  const ejemplos = rubro === "electro" ? EJEMPLOS.electro : EJEMPLOS.indumentaria;

  return [COLUMNAS.join(","), ...ejemplos.map((f) => f.map(celda).join(","))].join(
    "\r\n",
  );
}

export function nombreArchivoPlantilla(rubro: Rubro): string {
  return `plantilla-productos-${rubro === "electro" ? "electro" : "indumentaria"}.csv`;
}
