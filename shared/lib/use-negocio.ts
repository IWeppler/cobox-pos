"use client";

import { useParams } from "next/navigation";
import { rutaCatalogo } from "@/shared/lib/dominios";

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
 * Link dentro del catálogo actual. Devuelve "#" si no hay negocio en la ruta,
 * para no mandar a nadie a un catálogo que no existe.
 */
export function useRutaCatalogo(slugProducto?: string): string {
  const slugNegocio = useSlugNegocio();
  if (!slugNegocio) return "#";
  return rutaCatalogo(slugNegocio, slugProducto);
}
