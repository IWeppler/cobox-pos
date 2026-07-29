import type { ProductoIndice } from "@/entities/productos/types";
import type { Rubro } from "@/entities/config/types";

export type BadgeIdentidad = {
  /** Clave estable para React, no se muestra. */
  clave: string;
  texto: string;
  /** Tooltip: aclara qué es el dato cuando el badge va abreviado. */
  titulo?: string;
};

/**
 * Qué identifica a un producto en la fila de Inventario, según el rubro.
 *
 * - indumentaria: "N var." — lo que importa es cuántos talles/colores hay.
 * - electro: Modelo + EAN — un Samsung A15 no se distingue por "3 variantes"
 *   sino por su modelo oficial y su código de barras.
 *
 * El EAN se guarda en `producto_variantes.sku`; acá solo cambia el label.
 * Con más de una variante cada una tiene su propio EAN, así que se muestra el
 * conteo en vez de elegir uno arbitrariamente y mentir.
 */
export function badgesIdentidad(
  producto: ProductoIndice,
  variantesVisibles: { sku?: string | null }[],
  rubro: Rubro,
): BadgeIdentidad[] {
  if (rubro !== "electro") {
    return variantesVisibles.length > 1
      ? [
          {
            clave: "variantes",
            texto: `${variantesVisibles.length} var.`,
            titulo: `${variantesVisibles.length} variantes`,
          },
        ]
      : [];
  }

  const badges: BadgeIdentidad[] = [];

  if (producto.modelo) {
    badges.push({
      clave: "modelo",
      texto: producto.modelo,
      titulo: `Modelo ${producto.modelo}`,
    });
  }

  const conEan = variantesVisibles.filter((v) => v.sku);

  if (conEan.length === 1) {
    badges.push({
      clave: "ean",
      texto: conEan[0].sku as string,
      titulo: `EAN ${conEan[0].sku}`,
    });
  } else if (conEan.length > 1) {
    badges.push({
      clave: "ean",
      texto: `${conEan.length} EAN`,
      titulo: `${conEan.length} variantes, cada una con su EAN`,
    });
  }

  return badges;
}
