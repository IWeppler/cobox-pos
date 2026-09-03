import type { Producto } from "@/entities/productos/types";

/**
 * Lo que el POS puede vender, sacado del catálogo canónico.
 *
 * El catálogo del panel (`shared/actions/catalogo-panel.ts`) viene SIN
 * filtrar, porque /stock necesita ver también lo despublicado —si no, un
 * producto que se sacó de la vidriera no se puede volver a corregir—. El POS
 * necesita lo contrario, así que el filtro que antes hacía PostgREST
 * (`publicado = true` y `producto_variantes.activa = true`) se hace acá.
 *
 * Es exactamente el mismo criterio, movido de lugar: si esto se desincroniza
 * de aquella consulta, el POS empieza a ofrecer mercadería que la vidriera no
 * muestra. Por eso vive en una función con nombre y no inline en el
 * componente.
 *
 * ORDEN DE MAGNITUD, para saber qué se está filtrando: de 1.987 productos en
 * los seis negocios hay 2 despublicados y CERO variantes inactivas. O sea que
 * hoy no saca casi nada — pero es correcto por construcción y no por los datos
 * de este mes.
 *
 * Devuelve productos NUEVOS (no muta) porque el mismo array vive en el cache
 * de React Query y lo comparte /stock, que sí quiere ver todo.
 */
export function soloVendibles(productos: Producto[]): Producto[] {
  const vendibles: Producto[] = [];

  for (const producto of productos) {
    if (!producto.publicado) continue;

    const variantes = producto.producto_variantes;
    // `activa` puede no venir en el tipo de algunas consultas; si no está, la
    // variante cuenta como activa. Fail-open acá es lo correcto: esconder una
    // variante que sí se puede vender es perder una venta en el mostrador.
    const activas = variantes?.filter((v) => v.activa !== false);

    vendibles.push(
      activas && variantes && activas.length !== variantes.length
        ? { ...producto, producto_variantes: activas }
        : producto,
    );
  }

  return vendibles;
}
