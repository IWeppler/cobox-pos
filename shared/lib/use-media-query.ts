"use client";

import { useEffect, useState } from "react";

/**
 * Suscripción a una media query. Arranca en `false` (el server no tiene
 * viewport) y se resuelve en el primer efecto del cliente — nunca uses el
 * valor para decidir QUÉ datos mostrar, solo cómo mostrarlos.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const actualizar = () => setMatches(mediaQuery.matches);

    actualizar();
    mediaQuery.addEventListener("change", actualizar);

    return () => {
      mediaQuery.removeEventListener("change", actualizar);
    };
  }, [query]);

  return matches;
}

/** Breakpoint `sm` de Tailwind: por debajo de 640px es "mobile". */
export const MEDIA_MOBILE = "(max-width: 639px)";
