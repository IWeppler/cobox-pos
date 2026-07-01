import { Button } from "@/shared/ui/button";
import { SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { useState } from "react";

export interface OrdenOption {
  value: string;
  label: string;
}

interface CatalogToolbarProps {
  propiedadesGlobales: Record<string, string[]>;
  filtrosVariantes: Record<string, string>;
  orden: string;
  searchQuery: string;
  hayFiltrosActivos: boolean;
  ordenOptions: OrdenOption[];
  onFiltroVarianteChange: (propiedad: string, valor: string) => void;
  onOrdenChange: (orden: string) => void;
  onLimpiarFiltros: () => void;
}

export function CatalogToolbar({
  propiedadesGlobales,
  filtrosVariantes,
  orden,
  searchQuery,
  hayFiltrosActivos,
  ordenOptions,
  onFiltroVarianteChange,
  onOrdenChange,
  onLimpiarFiltros,
}: Readonly<CatalogToolbarProps>) {
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const propiedadesArray = Object.entries(propiedadesGlobales);

  return (
    <>
      {/* ── TOOLBAR MOBILE ── */}
      <div className="grid grid-cols-2 sm:hidden w-full border-y border-border bg-white sticky top-16 md:top-29 z-30 divide-x divide-border">
        <Dialog
          open={isMobileFiltersOpen}
          onOpenChange={setIsMobileFiltersOpen}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full h-12 rounded-none border-0 border-r border-border uppercase tracking-widest text-[10px] font-bold text-foreground hover:bg-muted/30 focus-visible:ring-0 flex items-center justify-center gap-2"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {(Object.keys(filtrosVariantes).length > 0 ||
                searchQuery !== "") && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="fixed inset-0 z-50 w-screen h-dvh max-w-none translate-x-0! translate-y-0! top-0! left-0! m-0 p-0 rounded-none border-none bg-white flex flex-col overflow-hidden [&>button]:hidden">
            <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between shadow-none space-y-0">
              <DialogTitle className="uppercase tracking-widest text-sm font-bold m-0">
                Filtros Avanzados
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="rounded-none cursor-pointer"
              >
                <X className="w-5 h-5" />
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {propiedadesArray.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center pt-8">
                  No hay propiedades configuradas.
                </p>
              ) : (
                propiedadesArray.map(([propName, values]) => (
                  <div key={propName} className="space-y-4">
                    <Label className="uppercase tracking-widest text-[10px] text-muted-foreground font-bold">
                      {propName}
                    </Label>
                    <Select
                      value={filtrosVariantes[propName] || "todos"}
                      onValueChange={(val) =>
                        onFiltroVarianteChange(propName, val)
                      }
                    >
                      <SelectTrigger className="w-full h-12 rounded-none bg-[#f5f4f4] border-0 shadow-none uppercase tracking-widest text-xs font-bold focus:ring-0">
                        <SelectValue placeholder={`Cualquier ${propName}`} />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border">
                        <SelectItem
                          value="todos"
                          className="rounded-none uppercase tracking-widest text-xs py-3"
                        >
                          Todos los {propName.toLowerCase()}s
                        </SelectItem>
                        {values.map((opt) => (
                          <SelectItem
                            key={opt}
                            value={opt}
                            className="rounded-none uppercase tracking-widest text-xs py-3"
                          >
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-border flex gap-3 bg-white mb-4">
              <Button
                variant="outline"
                onClick={onLimpiarFiltros}
                className="flex-1 rounded-none uppercase tracking-widest text-xs font-bold h-12 border-border shadow-none"
              >
                Limpiar
              </Button>
              <Button
                onClick={() => setIsMobileFiltersOpen(false)}
                className="flex-1 rounded-none uppercase tracking-widest text-xs font-bold h-12 shadow-none"
              >
                Ver Resultados
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Select value={orden} onValueChange={onOrdenChange}>
          <SelectTrigger className="w-full h-12 my-0 rounded-none border-0 shadow-none uppercase tracking-widest text-[10px] font-bold text-foreground focus:ring-0 bg-transparent hover:bg-muted/30 [&>svg]:hidden px-0 flex items-center justify-center">
            <div className="flex items-center justify-center gap-2 ">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Ordenar</span>
            </div>
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={4}
            className="w-50 rounded-none border-border"
          >
            {ordenOptions.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                className="rounded-none uppercase tracking-widest text-[10px] py-3 font-semibold"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── TOOLBAR DESKTOP ── */}
      <div className="hidden sm:flex items-center justify-between py-3 border-b border-border bg-[#fffefe] sticky top-23 z-30 mb-8">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-widest text-[10px] font-bold text-muted-foreground mr-1">
            Filtros Extra:
          </span>

          {propiedadesArray.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              Sin propiedades extras.
            </span>
          ) : (
            propiedadesArray.map(([propName, values]) => (
              <Select
                key={propName}
                value={filtrosVariantes[propName] || "todos"}
                onValueChange={(val) => onFiltroVarianteChange(propName, val)}
              >
                <SelectTrigger className="w-40 h-10 rounded-none border-0 bg-[#f5f4f4] shadow-none uppercase tracking-widest text-[10px] font-bold focus:ring-0 px-3">
                  <SelectValue placeholder={propName} />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border">
                  <SelectItem
                    value="todos"
                    className="rounded-none uppercase tracking-widest text-[11px] py-2.5"
                  >
                    Cualquier {propName}
                  </SelectItem>
                  {values.map((opt) => (
                    <SelectItem
                      key={opt}
                      value={opt}
                      className="rounded-none uppercase tracking-widest text-[11px] py-2.5"
                    >
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))
          )}

          {hayFiltrosActivos && (
            <Button
              variant="ghost"
              onClick={onLimpiarFiltros}
              className="h-10 rounded-none uppercase tracking-widest text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-[#f5f4f4] cursor-pointer"
            >
              Limpiar Todo
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="uppercase tracking-widest text-[10px] font-bold text-muted-foreground">
            Ordenar:
          </span>
          <Select value={orden} onValueChange={onOrdenChange}>
            <SelectTrigger className="w-50 h-10 rounded-none border-0 bg-[#f5f4f4] shadow-none uppercase tracking-widest text-[10px] font-bold focus:ring-0 px-3">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border">
              {ordenOptions.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="rounded-none uppercase tracking-widest text-[10px] py-2.5 font-semibold"
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
