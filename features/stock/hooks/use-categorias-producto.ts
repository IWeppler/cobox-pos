"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/shared/config/supabase/client";
import type { CategoriaOption } from "@/features/stock/types";

/**
 * Las categorías que puede tener un PRODUCTO: el árbol completo, padres e
 * hijas.
 *
 * Es distinto de `useActiveCategories`, que trae solo raíces y se queda como
 * está: sus otros consumidores —el dropdown "mover a categoría" del listado y
 * la condición de las promociones— razonan a nivel padre a propósito, y
 * ampliarlos es otra decisión.
 *
 * Lo que arregla acá: los tres formularios de producto (alta, edición y el
 * alta rápida del maestro) pedían las categorías con `.is("parent_id", null)`,
 * así que no había forma de asignarle a un producto una SUBcategoría. En un
 * catálogo en árbol —donde los productos cuelgan de las hojas— eso significa
 * que editar un producto de "MUJER › Vestidos" mostraba la categoría vacía, y
 * guardar podía moverlo al padre sin que nadie lo pidiera.
 */
export function useCategoriasProducto(): CategoriaOption[] {
  const [categorias, setCategorias] = useState<CategoriaOption[]>([]);

  useEffect(() => {
    const fetchCategorias = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("categorias")
        .select("id, nombre, parent_id")
        .eq("activa", true)
        // Por `orden` y después por nombre: `orden` es lo que el comercio
        // acomodó a mano en /categorias, y empatar en 0 (el default) es lo
        // normal en un catálogo que nadie ordenó todavía.
        .order("orden")
        .order("nombre");

      setCategorias(data ?? []);
    };

    fetchCategorias();
  }, []);

  return categorias;
}
