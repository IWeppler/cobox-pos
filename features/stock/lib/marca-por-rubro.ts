import type { Rubro } from "@/entities/config/types";
import { columnasDeRubro } from "./columnas-por-rubro";

/**
 * En qué rubros la MARCA es parte de la identidad del producto, y cómo se
 * llama en cada uno.
 *
 * No hay una lista nueva: se deriva de `columnas-por-rubro.ts`, que ya decide
 * qué le pide la planilla de ingreso a cada rubro. Duplicar el criterio en dos
 * archivos es lo que hace que un día la plantilla pida marca y el formulario
 * no la muestre.
 *
 * Por qué importa el rubro: "Yerba Del Monte" y "Yerba La Merced" son dos
 * productos distintos para un kiosco, y el nombre solo no alcanza para
 * distinguirlos en el buscador del POS. En indumentaria, en cambio, la prenda
 * se identifica por su nombre y su talle — Evens tiene 1.171 productos y CERO
 * con marca cargada, así que ahí el campo sería una columna vacía más.
 *
 * OJO con la asimetría: que un rubro no la pida NO significa esconder la marca
 * de un producto que ya la tiene. Estilo Bonito es indumentaria y tiene 201
 * productos con marca (entraron por planilla), y sacarles la única pantalla
 * donde se corrigen los volvería incorregibles — que es exactamente el
 * criterio que ya está escrito en `product-fiscal-section.tsx`.
 */
export function rubroUsaMarca(rubro: Rubro): boolean {
  return columnasDeRubro(rubro).some((c) => c.clave === "marca");
}

/**
 * Cómo se llama la marca en pantalla. En farmacia es el LABORATORIO, y así lo
 * dice ya la plantilla de ese rubro: quien carga un remedio no busca "marca",
 * busca el laboratorio.
 */
export function etiquetaMarca(rubro: Rubro): string {
  return rubro === "farmacia" ? "Laboratorio" : "Marca";
}

/**
 * Forma canónica de una marca contra las que ya existen en el catálogo.
 *
 * Mismo criterio que `normalizarAtributoKeyValor` con los atributos: si el
 * comercio ya escribió "Popys", tipear "popys" NO crea una segunda marca.
 * Medido en Estilo Bonito antes de esto: 34 marcas reales escritas de 39
 * formas distintas, con "popys (42 productos)" y "Popys (3)" conviviendo — o
 * sea que filtrar por marca dejaba 3 productos afuera sin avisar.
 *
 * Devuelve `null` para vacío, y la forma TIPEADA cuando no matchea ninguna
 * existente: una marca nueva se guarda como la escribieron, no capitalizada a
 * la fuerza (hay marcas que van en minúscula o todo en mayúsculas a propósito).
 */
export function canonicalizarMarca(
  marcaTipeada: string | null | undefined,
  marcasExistentes: readonly string[],
): string | null {
  const limpia = marcaTipeada?.trim();
  if (!limpia) return null;

  const comparable = limpia.toLowerCase();
  const existente = marcasExistentes.find(
    (m) => m.trim().toLowerCase() === comparable,
  );

  return existente ?? limpia;
}
