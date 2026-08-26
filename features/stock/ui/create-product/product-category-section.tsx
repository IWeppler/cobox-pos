"use client";

import { ChevronLeft, FolderTree, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CategoriaOption } from "@/features/stock/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type ProductCategorySectionProps = {
  categorias: CategoriaOption[];
  categoriaSeleccionada: string;
  onCategoriaSeleccionadaChange: (id: string) => void;
};

/**
 * Elegir la categoría de un producto, en DOS niveles.
 *
 * El catálogo es un árbol de dos niveles y los productos cuelgan de las hojas
 * ("MUJER › Vestidos"), pero este selector mostraba solo las raíces: no había
 * forma de asignar una subcategoría desde el alta ni desde la edición. Peor en
 * la edición, donde un producto que ya estaba en una hoja aparecía SIN
 * categoría —su id no estaba en la lista— y quien guardaba sin tocar nada se
 * arriesgaba a moverlo.
 *
 * El segundo nivel no es obligatorio: hay chip "Solo <Padre>" para el producto
 * que de verdad va en la raíz. Forzar la hoja rompería los catálogos planos,
 * que son un estado válido y frecuente al arrancar (ver
 * `shared/utils/category-tree.ts`, que es tolerante al estado mixto por el
 * mismo motivo).
 */
export function ProductCategorySection({
  categorias,
  categoriaSeleccionada,
  onCategoriaSeleccionadaChange,
}: ProductCategorySectionProps) {
  const [showCategory, setShowCategory] = useState(false);
  const [searchCat, setSearchCat] = useState("");
  /** Qué padre se está explorando. `null` = la grilla de padres. */
  const [padreAbierto, setPadreAbierto] = useState<string | null>(null);

  const porId = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias],
  );
  const padres = useMemo(
    () => categorias.filter((c) => !c.parent_id),
    [categorias],
  );
  const hijasDe = useMemo(() => {
    const mapa = new Map<string, CategoriaOption[]>();
    for (const c of categorias) {
      if (!c.parent_id) continue;
      mapa.set(c.parent_id, [...(mapa.get(c.parent_id) ?? []), c]);
    }
    return mapa;
  }, [categorias]);

  const seleccionada = categoriaSeleccionada
    ? porId.get(categoriaSeleccionada)
    : undefined;
  const padreDeSeleccionada = seleccionada?.parent_id
    ? porId.get(seleccionada.parent_id)
    : undefined;

  // "MUJER › Vestidos" cuando es hoja; el nombre solo cuando es raíz. Es el
  // mismo formato que el listado de inventario, para que el producto se lea
  // igual en los dos lados.
  const etiqueta = seleccionada
    ? padreDeSeleccionada
      ? `${padreDeSeleccionada.nombre} › ${seleccionada.nombre}`
      : seleccionada.nombre
    : null;

  const busqueda = searchCat.trim().toLowerCase();

  /** Con texto tipeado se busca en TODO el árbol y se muestra plano: quien
   * escribe "vestidos" quiere la hoja, no tener que acordarse de su padre. */
  const resultados = useMemo(() => {
    if (!busqueda) return [];
    return categorias
      .filter((c) => {
        const padre = c.parent_id ? porId.get(c.parent_id) : undefined;
        const completo = padre ? `${padre.nombre} ${c.nombre}` : c.nombre;
        return completo.toLowerCase().includes(busqueda);
      })
      .slice(0, 40);
  }, [busqueda, categorias, porId]);

  const cerrarConSeleccion = (id: string) => {
    onCategoriaSeleccionadaChange(id);
    setSearchCat("");
    setPadreAbierto(null);
    setShowCategory(false);
  };

  const elegir = (c: CategoriaOption) => {
    if (categoriaSeleccionada === c.id) {
      onCategoriaSeleccionadaChange("");
      setSearchCat("");
      setShowCategory(false);
      return;
    }

    // Un padre con hijas abre el segundo nivel en vez de cerrar: es
    // exactamente lo que faltaba. Si no tiene hijas, no hay nada que preguntar.
    const hijas = hijasDe.get(c.id) ?? [];
    if (!c.parent_id && hijas.length > 0) {
      setPadreAbierto(c.id);
      setSearchCat("");
      return;
    }

    cerrarConSeleccion(c.id);
  };

  const abrirPanel = () => {
    // Se abre parado donde está el producto: si ya tiene una hoja, sus
    // hermanas a la vista.
    setPadreAbierto(padreDeSeleccionada?.id ?? null);
    setShowCategory(true);
  };

  const padreExplorado = padreAbierto ? porId.get(padreAbierto) : undefined;
  const hijasVisibles = padreAbierto ? (hijasDe.get(padreAbierto) ?? []) : [];

  const chip = (activo: boolean) =>
    `flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all border ${
      activo
        ? "bg-[#0f172a] text-white border-[#0f172a]"
        : "bg-card text-foreground border-border hover:bg-muted cursor-pointer"
    }`;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between p-3 md:p-5 cursor-pointer"
        onClick={abrirPanel}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted/30 rounded-md border border-border/50">
            <FolderTree className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Categoría</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {etiqueta ?? "Asigna una categoría a este producto"}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="font-bold text-foreground hover:bg-muted shadow-none h-8 text-sm px-3"
          onClick={(e) => {
            e.stopPropagation();
            abrirPanel();
          }}
        >
          {categoriaSeleccionada ? "Cambiar" : "+ Añadir"}
        </Button>
      </div>

      {showCategory && (
        <div className="px-2 md:px-5 pb-5 pt-2 animate-in fade-in slide-in-from-top-2 border-t border-border/50 mt-2 space-y-4">
          <div className="relative pt-3">
            <Search className="w-4 h-4 absolute left-3 top-[34px] -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-11 shadow-none border-border"
              placeholder="Buscar categoría o subcategoría..."
              value={searchCat}
              onChange={(e) => setSearchCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || resultados.length !== 1) return;
                e.preventDefault();
                cerrarConSeleccion(resultados[0].id);
              }}
              autoFocus
            />
          </div>

          {busqueda ? (
            <div className="flex flex-wrap gap-2">
              {resultados.length === 0 ? (
                <p className="w-full px-3 py-3 text-sm text-center text-muted-foreground">
                  No se encontraron categorías.
                </p>
              ) : (
                resultados.map((c) => {
                  const padre = c.parent_id ? porId.get(c.parent_id) : undefined;
                  const activo = categoriaSeleccionada === c.id;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => cerrarConSeleccion(c.id)}
                      className={chip(activo)}
                    >
                      {padre ? (
                        <span className="opacity-60">{padre.nombre} › </span>
                      ) : null}
                      {c.nombre}
                      {activo ? <X className="w-3.5 h-3.5 ml-1 opacity-80" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : padreExplorado ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  onClick={() => setPadreAbierto(null)}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Categorías
                </Button>
                <p className="text-xs font-bold">
                  Subcategoría de {padreExplorado.nombre}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {hijasVisibles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegir(c)}
                    className={chip(categoriaSeleccionada === c.id)}
                  >
                    {c.nombre}
                    {categoriaSeleccionada === c.id ? (
                      <X className="w-3.5 h-3.5 ml-1 opacity-80" />
                    ) : null}
                  </button>
                ))}

                {/* Para el producto que de verdad va en la raíz. Sin esto,
                    abrir el segundo nivel sería una trampa: no habría forma de
                    quedarse en el padre. */}
                <button
                  type="button"
                  onClick={() => cerrarConSeleccion(padreExplorado.id)}
                  className={`${chip(
                    categoriaSeleccionada === padreExplorado.id,
                  )} border-dashed`}
                >
                  Solo {padreExplorado.nombre}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {padres.length === 0 ? (
                <p className="w-full px-3 py-3 text-sm text-center text-muted-foreground">
                  No se encontraron categorías.
                </p>
              ) : (
                padres.map((c) => {
                  const hijas = hijasDe.get(c.id) ?? [];
                  const activo =
                    categoriaSeleccionada === c.id ||
                    padreDeSeleccionada?.id === c.id;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => elegir(c)}
                      className={chip(activo)}
                    >
                      {c.nombre}
                      {hijas.length > 0 ? (
                        <span className="opacity-60">({hijas.length})</span>
                      ) : null}
                      {categoriaSeleccionada === c.id && hijas.length === 0 ? (
                        <X className="w-3.5 h-3.5 ml-1 opacity-80" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <input type="hidden" name="categoria_id" value={categoriaSeleccionada} />
    </div>
  );
}
