"use client";

import { FolderTree, Search, X } from "lucide-react";
import { useState } from "react";
import type { CategoriaOption } from "@/features/stock/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type ProductCategorySectionProps = {
  categorias: CategoriaOption[];
  categoriaSeleccionada: string;
  onCategoriaSeleccionadaChange: (id: string) => void;
};

export function ProductCategorySection({
  categorias,
  categoriaSeleccionada,
  onCategoriaSeleccionadaChange,
}: ProductCategorySectionProps) {
  const [showCategory, setShowCategory] = useState(false);
  const [searchCat, setSearchCat] = useState("");

  const categoriaNombre = categorias.find(
    (c) => c.id === categoriaSeleccionada,
  )?.nombre;
  const filteredCats = categorias.filter((c) =>
    c.nombre.toLowerCase().includes(searchCat.toLowerCase()),
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between p-3 md:p-5 cursor-pointer"
        onClick={() => setShowCategory(true)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted/30 rounded-md border border-border/50">
            <FolderTree className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Categoría</p>
            {categoriaSeleccionada ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {categoriaNombre}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                Asigna una categoría a este producto
              </p>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="font-bold text-foreground hover:bg-muted shadow-none h-8 text-sm px-3"
          onClick={(e) => {
            e.stopPropagation();
            setShowCategory(true);
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
              placeholder="Buscar y seleccionar categoría..."
              value={searchCat}
              onChange={(e) => setSearchCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || filteredCats.length !== 1) return;
                e.preventDefault();
                const c = filteredCats[0];
                const selected = categoriaSeleccionada === c.id;
                onCategoriaSeleccionadaChange(selected ? "" : c.id);
                setSearchCat("");
                setShowCategory(false);
              }}
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {filteredCats.length === 0 ? (
              <p className="w-full px-3 py-3 text-sm text-center text-muted-foreground">
                No se encontraron categorías.
              </p>
            ) : (
              filteredCats.map((c) => {
                const selected = categoriaSeleccionada === c.id;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onCategoriaSeleccionadaChange(selected ? "" : c.id);
                      setSearchCat("");
                      setShowCategory(false);
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all border ${
                      selected
                        ? "bg-[#0f172a] text-white border-[#0f172a]"
                        : "bg-card text-foreground border-border hover:bg-muted cursor-pointer"
                    }`}
                  >
                    {c.nombre}
                    {selected ? (
                      <X className="w-3.5 h-3.5 ml-1 opacity-80" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <input type="hidden" name="categoria_id" value={categoriaSeleccionada} />
    </div>
  );
}
