"use client";

import { useParams } from "next/navigation";
import { rutaCatalogoEnModo } from "@/shared/lib/dominios";
import { useModoCatalogo } from "@/shared/components/modo-catalogo-provider";

/**
 * Slug del negocio del catálogo que se está viendo, tomado de la ruta
 * /store/[negocio]. Es null fuera del catálogo (por ejemplo en el backoffice),
 * y en ese caso no hay a qué tienda linkear: nunca se asume una.
 */
export function useSlugNegocio(): string | null {
  const params = useParams();
  const valor = params?.negocio;
  return typeof valor === "string" && valor ? valor : null;
}

/**
 * Constructor de links del catálogo actual. Es una función y no un valor porque
 * las grillas arman un link por producto dentro de un `map`, donde no se puede
 * llamar a un hook: se toma el constructor una vez y se lo usa N veces.
 *
 * Devuelve "#" si no hay negocio en la ruta, para no mandar a nadie a un
 * catálogo que no existe.
 */
export function useLinkCatalogo(): (slugProducto?: string | null) => string {
  const slugNegocio = useSlugNegocio();
  const modo = useModoCatalogo();

  return (slugProducto) => {
    if (!slugNegocio) return "#";
    return rutaCatalogoEnModo(modo, slugNegocio, slugProducto ?? undefined);
  };
}

/** Link a un destino puntual del catálogo actual. */
export function useRutaCatalogo(slugProducto?: string): string {
  return useLinkCatalogo()(slugProducto);
}
