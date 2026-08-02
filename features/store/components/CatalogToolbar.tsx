"use client";

import { Button } from "@/shared/ui/button";
import {
  SlidersHorizontal,
  ArrowUpDown,
  X,
  Check,
  ChevronDown,
} from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
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
      <div className="grid grid-cols-2 sm:hidden w-full border-y border-border bg-background sticky top-16 md:top-29 z-30 divide-x divide-border">
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
          <DialogContent className="fixed inset-0 z-50 w-screen h-dvh max-w-none translate-x-0! translate-y-0! top-0! left-0! m-0 p-0 rounded-none border-none bg-background flex flex-col overflow-hidden [&>button]:hidden">
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
                propiedadesArray.map(([propName, values]) => {
                  const valorActual = filtrosVariantes[propName];
                  const isTalle = propName.toLowerCase().includes("talle");
                  const isColor = propName.toLowerCase().includes("color");

                  return (
                    <div key={propName} className="space-y-4">
                      <Label className="uppercase tracking-widest text-[10px] text-muted-foreground font-bold">
                        {propName}
                      </Label>

                      {/* 1. MOBILE: GRILLA DE TALLES */}
                      {isTalle && (
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            variant={
                              !valorActual || valorActual === "todos"
                                ? "default"
                                : "outline"
                            }
                            className="rounded-none uppercase tracking-widest text-[10px] h-10 shadow-none col-span-3"
                            onClick={() =>
                              onFiltroVarianteChange(propName, "todos")
                            }
                          >
                            Cualquiera
                          </Button>
                          {values.map((opt) => (
                            <Button
                              key={opt}
                              variant={
                                valorActual === opt ? "default" : "outline"
                              }
                              className="rounded-none uppercase tracking-widest text-xs h-10 shadow-none font-bold"
                              onClick={() =>
                                onFiltroVarianteChange(propName, opt)
                              }
                            >
                              {opt}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* 2. MOBILE: COMBOBOX DE COLORES (INLINE) */}
                      {isColor && (
                        <div className="border border-border">
                          <Command className="rounded-none bg-transparent">
                            <CommandInput
                              placeholder={`Buscar ${propName.toLowerCase()}...`}
                              className="text-xs h-11 border-none focus:ring-0"
                            />
                            <CommandList className="max-h-48 overflow-y-auto">
                              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                                No se encontró el color.
                              </CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() =>
                                    onFiltroVarianteChange(propName, "todos")
                                  }
                                  className="text-xs uppercase font-semibold cursor-pointer py-3 rounded-none"
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${!valorActual || valorActual === "todos" ? "opacity-100" : "opacity-0"}`}
                                  />
                                  Cualquier {propName}
                                </CommandItem>
                                {values.map((opt) => (
                                  <CommandItem
                                    key={opt}
                                    onSelect={() =>
                                      onFiltroVarianteChange(propName, opt)
                                    }
                                    className="text-xs uppercase font-medium cursor-pointer py-3 rounded-none"
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${valorActual === opt ? "opacity-100" : "opacity-0"}`}
                                    />
                                    {opt}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </div>
                      )}

                      {/* 3. MOBILE: SELECT ESTÁNDAR (Resto de propiedades) */}
                      {!isTalle && !isColor && (
                        <Select
                          value={valorActual || "todos"}
                          onValueChange={(val) =>
                            onFiltroVarianteChange(propName, val)
                          }
                        >
                          <SelectTrigger className="w-full h-12 rounded-none bg-card border border-border shadow-none uppercase tracking-widest text-xs font-bold focus:ring-0">
                            <SelectValue
                              placeholder={`Cualquier ${propName}`}
                            />
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
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-border flex gap-3 bg-background mb-4">
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
      <div className="hidden sm:flex items-center justify-between p-3 rounded-lg border-b dark:border border-border bg-card sticky top-23 z-30 mb-8">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-widest text-[10px] font-bold text-muted-foreground mr-1">
            Filtros Extra:
          </span>

          {propiedadesArray.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              Sin propiedades extras.
            </span>
          ) : (
            propiedadesArray.map(([propName, values]) => {
              const valorActual = filtrosVariantes[propName];
              const isTalle = propName.toLowerCase().includes("talle");
              const isColor = propName.toLowerCase().includes("color");

              // 1. DESKTOP: GRILLA DE TALLES EN POPOVER
              if (isTalle) {
                return (
                  <Popover key={propName}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-auto min-w-32 h-10 rounded-none border-0 bg-card shadow-none uppercase tracking-widest text-[10px] font-bold px-3 hover:bg-muted flex justify-between items-center gap-2"
                      >
                        {valorActual || `Cualquier ${propName}`}
                        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-3 shadow-xl rounded-none border-border"
                      align="start"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                        Seleccionar {propName}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <Button
                          variant={
                            !valorActual || valorActual === "todos"
                              ? "default"
                              : "outline"
                          }
                          className="h-9 text-[10px] uppercase tracking-widest col-span-4 shadow-none rounded-none"
                          onClick={() =>
                            onFiltroVarianteChange(propName, "todos")
                          }
                        >
                          Cualquiera
                        </Button>
                        {values.map((opt) => (
                          <Button
                            key={opt}
                            variant={
                              valorActual === opt ? "default" : "outline"
                            }
                            className="h-9 text-xs font-bold uppercase shadow-none px-1 rounded-none"
                            onClick={() =>
                              onFiltroVarianteChange(propName, opt)
                            }
                          >
                            {opt}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }

              // 2. DESKTOP: COMBOBOX DE COLORES
              if (isColor) {
                return (
                  <Popover key={propName}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-auto min-w-32 h-10 rounded-none border-0 bg-card shadow-none uppercase tracking-widest text-[10px] font-bold px-3 hover:bg-muted flex justify-between items-center gap-2"
                      >
                        {valorActual || `Cualquier ${propName}`}
                        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[240px] p-0 shadow-xl rounded-none border-border"
                      align="start"
                    >
                      <Command className="rounded-none">
                        <CommandInput
                          placeholder={`Buscar ${propName.toLowerCase()}...`}
                          className="text-xs h-10 border-none focus:ring-0"
                        />
                        <CommandList className="max-h-[220px]">
                          <CommandEmpty className="py-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                            Color no encontrado.
                          </CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() =>
                                onFiltroVarianteChange(propName, "todos")
                              }
                              className="text-[10px] tracking-widest uppercase font-bold cursor-pointer py-2.5 rounded-none"
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${!valorActual || valorActual === "todos" ? "opacity-100" : "opacity-0"}`}
                              />
                              Cualquier {propName}
                            </CommandItem>
                            {values.map((opt) => (
                              <CommandItem
                                key={opt}
                                onSelect={() =>
                                  onFiltroVarianteChange(propName, opt)
                                }
                                className="text-[10px] tracking-widest uppercase font-semibold cursor-pointer py-2.5 rounded-none"
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${valorActual === opt ? "opacity-100" : "opacity-0"}`}
                                />
                                {opt}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              }

              // 3. DESKTOP: SELECT ESTÁNDAR
              return (
                <Select
                  key={propName}
                  value={valorActual || "todos"}
                  onValueChange={(val) => onFiltroVarianteChange(propName, val)}
                >
                  <SelectTrigger className="w-auto min-w-32 h-10 rounded-none border-0 bg-card shadow-none uppercase tracking-widest text-[10px] font-bold focus:ring-0 px-3">
                    <SelectValue placeholder={propName} />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border">
                    <SelectItem
                      value="todos"
                      className="rounded-none uppercase tracking-widest text-[10px] py-2.5 font-bold"
                    >
                      Cualquier {propName}
                    </SelectItem>
                    {values.map((opt) => (
                      <SelectItem
                        key={opt}
                        value={opt}
                        className="rounded-none uppercase tracking-widest text-[10px] py-2.5 font-semibold"
                      >
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })
          )}

          {hayFiltrosActivos && (
            <Button
              variant="ghost"
              onClick={onLimpiarFiltros}
              className="h-10 rounded-none uppercase tracking-widest text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-card cursor-pointer ml-2"
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
            <SelectTrigger className="w-48 h-10 rounded-none border-0 bg-card shadow-none uppercase tracking-widest text-[10px] font-bold focus:ring-0 px-3">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border" align="end">
              {ordenOptions.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="rounded-none uppercase tracking-widest text-[10px] py-2.5 font-bold"
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
