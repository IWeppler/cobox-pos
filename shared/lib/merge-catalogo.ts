import type { Producto } from "@/entities/productos/types";
import { calcularStockDisponible } from "@/entities/productos/lib/stock-disponible";
import type { CatalogoPanel } from "@/shared/actions/catalogo-panel";
import type { CatalogoDelta } from "@/shared/actions/catalogo-delta";

/**
 * Aplica un delta sobre la copia local del catálogo.
 *
 * PURA Y SIN IO a propósito: es la pieza donde un error no da un mensaje sino
 * un producto de menos en la grilla del POS, así que tiene que poder probarse
 * entera sin base y sin navegador. Ver `merge-catalogo.test.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS TRES REGLAS
 *
 * 1. UPSERT POR ID, nunca "agregar lo nuevo". El delta re-trae de más a
 *    propósito (los 60 segundos de solapamiento de `cursor-catalogo.ts`), así
 *    que aplicar dos veces la misma fila tiene que dar exactamente lo mismo.
 *
 * 2. LAS BAJAS VAN DESPUÉS DE LOS ALTAS. Los ids son uuid y no se reciclan, así
 *    que en la práctica no se pisan; el orden es igual explícito para que no
 *    dependa de esa suerte.
 *
 * 3. EL ORDEN ES EL DEL SERVIDOR (`creado_en` desc). Si el merge dejara los
 *    productos nuevos al final, la grilla se vería distinta según si el
 *    catálogo vino por delta o completo — y "se ordena distinto en mi celular"
 *    es de los bugs que nadie reporta y todos sufren. Se re-ordena solo cuando
 *    llegaron productos: una baja no mueve a nadie de lugar.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * DEVUELVE UN `CatalogoPanel` COMPLETO, con la misma forma que la carga
 * completa. Es la invariante que protege `columnas-catalogo-panel.ts`, pero
 * del lado del cliente: la pantalla no puede poder distinguir cómo llegó cada
 * producto.
 */
export function mergearCatalogo(
  anterior: CatalogoPanel,
  delta: CatalogoDelta,
): CatalogoPanel {
  // `completo` es el servidor diciendo "no confíes en tu copia": el cursor era
  // más viejo que la retención de tombstones, así que puede haber bajas que ya
  // no se pueden avisar. Se reemplaza en vez de mergear.
  const base = delta.completo ? [] : anterior.productos;

  const porId = new Map<string, Producto>();
  for (const p of base) porId.set(p.id, p);
  for (const p of delta.productos) porId.set(p.id, p);

  const variantesBorradas = new Set<string>();
  for (const baja of delta.borrados) {
    if (baja.tabla === "productos") {
      porId.delete(baja.fila_id);
    } else if (baja.tabla === "producto_variantes") {
      variantesBorradas.add(baja.fila_id);
    }
    // Las bajas de `categorias` no se aplican acá: la lista viene COMPLETA en
    // `delta.resto` y se reemplaza entera, así que una categoría borrada ya no
    // está en la que llega. Aplicar el tombstone además sería trabajo de más
    // sobre un dato que ya es correcto.
  }

  let productos = [...porId.values()];

  // Una variante puede desaparecer sin que su producto cambie de fila (borrar
  // un talle no toca `productos.updated_at`), así que el tombstone es el ÚNICO
  // aviso. Sin esto quedaría un talle fantasma en el POS que solo falla al
  // cerrar la venta, con la clienta adelante.
  if (variantesBorradas.size > 0) {
    productos = productos.map((p) => {
      const variantes = p.producto_variantes;
      if (!variantes?.length) return p;
      const quedan = variantes.filter((v) => !variantesBorradas.has(v.id));
      return quedan.length === variantes.length
        ? p
        : { ...p, producto_variantes: quedan };
    });
  }

  productos = reanotarStockDisponible(productos, delta.reservasPorVariante);

  if (delta.productos.length > 0) {
    productos = ordenarComoElServidor(productos);
  }

  return { ...delta.resto, productos, cursor: delta.cursor };
}

/**
 * Re-calcula `stock_disponible` sobre TODO el catálogo, no solo sobre lo que
 * trajo el delta.
 *
 * Es necesario porque una reserva se crea sin tocar el producto —`reservas` es
 * otra tabla— así que un producto apartado no aparece en ningún delta. Ver el
 * campo `reservasPorVariante` de `CatalogoDelta`.
 *
 * CONSERVA LA IDENTIDAD de lo que no cambió (devuelve el mismo objeto) para no
 * invalidar la memoización de la grilla en cada sincronización: el caso normal
 * es que no haya ninguna reserva y que esta función no cree un solo objeto.
 */
function reanotarStockDisponible(
  productos: Producto[],
  reservasPorVariante: Record<string, number>,
): Producto[] {
  return productos.map((p) => {
    const variantes = p.producto_variantes;
    if (!variantes?.length) return p;

    let cambio = false;
    const nuevas = variantes.map((v) => {
      const disponible = calcularStockDisponible(
        v.stock,
        v.id,
        reservasPorVariante,
      );
      if (v.stock_disponible === disponible) return v;
      cambio = true;
      return { ...v, stock_disponible: disponible };
    });

    return cambio ? { ...p, producto_variantes: nuevas } : p;
  });
}

/**
 * El mismo orden que devuelve la consulta completa: `creado_en` descendente.
 *
 * Desempata por id, y no por prolijidad: dos productos creados en el mismo
 * milisegundo (una importación de planilla los crea en lote) quedarían en un
 * orden distinto en cada sincronización, y la grilla se reacomodaría sola
 * mientras alguien la está mirando.
 */
function ordenarComoElServidor(productos: Producto[]): Producto[] {
  return [...productos].sort((a, b) => {
    const fechaA = a.creado_en ?? "";
    const fechaB = b.creado_en ?? "";
    if (fechaA !== fechaB) return fechaA < fechaB ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}
