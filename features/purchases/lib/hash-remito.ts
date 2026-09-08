import { createHash } from "node:crypto";
import type { RawOrderItem } from "../actions/create-purchase";

/**
 * Huella del CONTENIDO de un remito de proveedor, para detectar que el mismo
 * archivo se está subiendo dos veces.
 *
 * POR QUÉ (medido el 8/9/2026 sobre los 126 remitos de proveedor reales). La
 * planilla propia ya tenía guard —`ordenes_compra.hash_planilla` con unique
 * parcial— pero el remito guardaba `null` ahí, así que cada subida creaba una
 * orden nueva. Resultado: 14 archivos subidos más de una vez, uno de ellos
 * SIETE veces ("Rop", Evens, 107 líneas), y uno aprobado DOS veces (Estilo
 * Bonito, 217 líneas, 254 unidades duplicadas — el remito que alguien terminó
 * renombrando a mano "[CLON ANULADO 28/07]").
 *
 * Subir de nuevo cuando la carga tarda es lo que hace cualquiera. El guard es
 * más barato que enseñar a no hacerlo.
 *
 * SE CALCULA SOBRE LAS FILAS PARSEADAS, no sobre los bytes: el mismo remito
 * exportado como CSV y como XLSX, o vuelto a guardar con otro encoding, es el
 * mismo remito. Cambiar una cantidad o un costo lo vuelve otro, que es
 * justamente cuando hay que poder subirlo.
 *
 * NO incluye el nombre del proveedor, y esa es una decisión con motivo: es un
 * campo de texto libre que la misma persona escribe distinto cada vez ("IN",
 * "Er", "Rop", "CHALECOS " con espacio final — 49 nombres para 104 remitos en
 * Evens). Si entrara en la huella, corregir el nombre alcanzaría para esquivar
 * el guard, que es el escenario más probable de todos.
 *
 * Mismo criterio y misma serialización estable que `hashPlanillaProductos`:
 * campos en orden fijo, para que dos corridas del mismo archivo no dependan
 * del orden en que el parser pobló el objeto.
 */
export function hashRemitoProveedor(items: RawOrderItem[]): string {
  const normalizados = items.map((item) => [
    item.raw_nombre.trim(),
    item.raw_variante.trim(),
    item.raw_categoria?.trim() ?? "",
    item.raw_genero?.trim() ?? "",
    item.raw_sku?.trim() ?? "",
    item.raw_marca?.trim() ?? "",
    item.raw_imei?.trim() ?? "",
    item.cantidad,
    item.precio_costo,
    item.precio_venta ?? "",
  ]);

  return createHash("sha256")
    .update(JSON.stringify(normalizados))
    .digest("hex");
}
