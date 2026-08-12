"use client";

import { createContext, useContext } from "react";
import type { ModoCatalogo } from "@/shared/lib/host-comerz";

/**
 * Cómo se está sirviendo el catálogo, para que los links del cliente coincidan
 * con la URL que ve el visitante.
 *
 * Va por contexto y no leyendo `window.location` porque estos componentes
 * renderizan primero en el server: mirar el host solo en el browser daría un
 * href en el HTML y otro después de hidratar. El valor lo pone el layout desde
 * el header que dejó el middleware, así que server y cliente dicen lo mismo.
 *
 * El default es "path", que es el modo que funciona en cualquier deploy.
 */
const ModoCatalogoContext = createContext<ModoCatalogo>("path");

export function ModoCatalogoProvider({
  modo,
  children,
}: Readonly<{ modo: ModoCatalogo; children: React.ReactNode }>) {
  return (
    <ModoCatalogoContext.Provider value={modo}>
      {children}
    </ModoCatalogoContext.Provider>
  );
}

export function useModoCatalogo(): ModoCatalogo {
  return useContext(ModoCatalogoContext);
}
