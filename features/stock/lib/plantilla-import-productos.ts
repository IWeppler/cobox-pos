import type { Rubro } from "@/entities/config/types";
import { columnasDeRubro } from "./columnas-por-rubro";

/**
 * Plantilla CSV de la importación de mercadería, por rubro.
 *
 * Existe porque "estas son las columnas" en un cartelito no alcanza: el
 * comercio arma la planilla en Excel y la primera importación se va en
 * columnas mal nombradas o en una fila por producto cuando el aparato lleva
 * IMEI. Bajar el archivo ya armado y reemplazar las filas de ejemplo saca ese
 * paso del medio.
 *
 * Las COLUMNAS salen de `columnasDeRubro`, no de una lista propia: hasta acá
 * eran nueve fijas para todos y una carnicería tenía que llenar `memoria` sin
 * tener dónde poner el peso. Acá solo viven los EJEMPLOS, que es lo que no se
 * puede derivar — hay que conocer el rubro para escribir una fila creíble.
 *
 * Los ejemplos importan más de lo que parece: son lo que enseña la regla que
 * nadie adivina (dos aparatos iguales = dos filas por el IMEI; el mismo
 * producto en dos talles = dos filas). Se escriben como objetos y no como
 * arrays posicionales justamente para que agregar una columna al rubro no
 * desalinee en silencio todas las filas de ejemplo.
 */

type FilaEjemplo = Record<string, string>;

const EJEMPLOS: Record<Rubro, FilaEjemplo[]> = {
  indumentaria: [
    // El mismo producto en dos talles: dos filas, mismo nombre.
    { categoria: "Remeras", producto: "Remera lisa algodón", talle: "M", color: "Negro", stock: "12", precio_costo: "6000", precio_venta: "14900" },
    { categoria: "Remeras", producto: "Remera lisa algodón", talle: "L", color: "Negro", stock: "8", precio_costo: "6000", precio_venta: "14900" },
    { categoria: "Pantalones", producto: "Jean recto", talle: "40", color: "Azul", stock: "5", precio_costo: "14000", precio_venta: "32900" },
  ],
  electro: [
    // Dos filas del MISMO modelo con IMEI distinto: es la forma correcta de
    // cargar dos aparatos iguales, y la que nadie adivina sola.
    { categoria: "Celulares", codigo_barras: "7791234567890", producto: "Samsung Galaxy A15", modelo: "SM-A155M", color: "Negro", memoria: "128GB", stock: "1", imei: "356938035643809", precio_costo: "180000", precio_venta: "255000" },
    { categoria: "Celulares", codigo_barras: "7791234567890", producto: "Samsung Galaxy A15", modelo: "SM-A155M", color: "Negro", memoria: "128GB", stock: "1", imei: "356938035643810", precio_costo: "180000", precio_venta: "255000" },
    { categoria: "Televisores", codigo_barras: "7799876543210", producto: "Smart TV 50 4K", modelo: "UN50CU7000", stock: "4", precio_costo: "320000", precio_venta: "459000" },
  ],
  alimentos: [
    // El mismo producto en dos presentaciones: dos filas.
    { categoria: "Lácteos", codigo_barras: "7790004445556", producto: "Leche entera", marca: "La Serenísima", peso: "1L", unidad_medida: "Litro", stock: "24", precio_costo: "1100", precio_venta: "1750" },
    { categoria: "Lácteos", codigo_barras: "7790004445563", producto: "Leche entera", marca: "La Serenísima", peso: "500ml", unidad_medida: "Litro", stock: "12", precio_costo: "700", precio_venta: "1150" },
    { categoria: "Fiambres", codigo_barras: "7790001112223", producto: "Jamón cocido", marca: "Paladini", peso: "1kg", unidad_medida: "Kilogramo", stock: "8", precio_costo: "7800", precio_venta: "12500" },
  ],
  farmacia: [
    { categoria: "Analgésicos", codigo_barras: "7795000111222", producto: "Ibuprofeno 400mg", marca: "Bayer", presentacion: "Caja x30 comprimidos", stock: "15", precio_costo: "2400", precio_venta: "4300" },
    { categoria: "Analgésicos", codigo_barras: "7795000111239", producto: "Ibuprofeno 400mg", marca: "Bayer", presentacion: "Caja x10 comprimidos", stock: "22", precio_costo: "900", precio_venta: "1800" },
  ],
  ferreteria: [
    // Mismo producto en dos medidas: dos filas.
    { categoria: "Plomería", codigo_barras: "7798000111222", producto: "Codo roscado", marca: "Fusiplast", medida: '1/2"', material: "PVC", stock: "40", precio_costo: "600", precio_venta: "1400" },
    { categoria: "Plomería", codigo_barras: "7798000111239", producto: "Codo roscado", marca: "Fusiplast", medida: '3/4"', material: "PVC", stock: "25", precio_costo: "850", precio_venta: "1900" },
    { categoria: "Herramientas", codigo_barras: "7798000999888", producto: "Pinza universal 8", marca: "Bahco", medida: '8"', material: "Acero", stock: "6", precio_costo: "12000", precio_venta: "23500" },
  ],
  quioscos: [
    { categoria: "Golosinas", codigo_barras: "7790040111222", producto: "Chocolate con leche 100g", marca: "Águila", unidad_medida: "Unidad", stock: "36", precio_costo: "900", precio_venta: "1600" },
    { categoria: "Bebidas", codigo_barras: "7790895000123", producto: "Gaseosa cola 500ml", marca: "Coca-Cola", unidad_medida: "Unidad", stock: "48", precio_costo: "1200", precio_venta: "2000" },
  ],
  otros: [
    { categoria: "General", codigo_barras: "7790000000001", producto: "Producto de ejemplo", stock: "10", precio_costo: "1000", precio_venta: "2000" },
  ],
};

/** Escapa una celda para CSV: comillas dobles solo si hace falta. */
function celda(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

export function plantillaImportProductos(rubro: Rubro): string {
  const columnas = columnasDeRubro(rubro);
  const ejemplos = EJEMPLOS[rubro] ?? EJEMPLOS.otros;

  const encabezado = columnas.map((c) => c.clave).join(",");
  // Una fila de ejemplo que no tenga una columna la deja vacía en vez de
  // correrse: el orden lo manda el encabezado, no el objeto.
  const filas = ejemplos.map((fila) =>
    columnas.map((c) => celda(fila[c.clave] ?? "")).join(","),
  );

  return [encabezado, ...filas].join("\r\n");
}

export function nombreArchivoPlantilla(rubro: Rubro): string {
  return `plantilla-mercaderia-${rubro}.csv`;
}
