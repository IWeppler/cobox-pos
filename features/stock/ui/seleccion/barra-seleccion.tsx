"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import type { SeleccionProductos } from "../../hooks/use-seleccion-productos";
import {
  accionesVisibles,
  MAX_ACCIONES_EN_BARRA,
  type AccionMasiva,
  type CtxSeleccion,
} from "./acciones-masivas";

interface BarraSeleccionProps {
  seleccion: SeleccionProductos;
  ctx: CtxSeleccion;
}

/**
 * El módulo entra en "modo selección": esta barra REEMPLAZA al toolbar de
 * filtros en el mismo lugar y con la misma altura, en vez de sumar una capa
 * flotante encima del contenido. La tabla no se corre, la paginación sigue
 * accesible y la selección sobrevive a cambiar de página.
 *
 * Ninguna acción se ejecuta acá adentro: la barra dispara, cada acción abre
 * su propio modal. Por eso la barra no crece cuando el registro de acciones
 * crece (ver acciones-masivas.tsx).
 */
export function BarraSeleccion({
  seleccion,
  ctx,
}: Readonly<BarraSeleccionProps>) {
  const [claveActiva, setClaveActiva] = useState<string | null>(null);
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [isPending, startTransition] = useTransition();

  const acciones = accionesVisibles(ctx);
  // Peligro nunca es botón de un click en la barra: eliminar vive siempre
  // detrás del menú.
  const enBarra = acciones
    .filter((a) => a.grupo !== "peligro")
    .slice(0, MAX_ACCIONES_EN_BARRA);
  const enMenu = acciones.filter((a) => !enBarra.includes(a));

  const accionActiva = acciones.find((a) => a.clave === claveActiva) ?? null;

  // Esc sale del modo selección, salvo que haya algo abierto encima (ahí el
  // Esc es del modal/sheet, no nuestro).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (claveActiva || sheetAbierto) return;
      seleccion.limpiar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [claveActiva, sheetAbierto, seleccion]);

  const activar = (accion: AccionMasiva) => {
    setSheetAbierto(false);
    if (accion.Modal) {
      setClaveActiva(accion.clave);
      return;
    }
    if (accion.ejecutar) {
      startTransition(async () => {
        await accion.ejecutar!(ctx);
      });
    }
  };

  const etiquetaConteo = `${seleccion.cantidad} ${
    seleccion.cantidad === 1 ? "seleccionado" : "seleccionados"
  }`;

  return (
    <>
      {/* El modal de la acción activa se monta solo cuando se activa: nada de
          mantener 6 diálogos montados detrás de la tabla. */}
      {accionActiva?.Modal && (
        <accionActiva.Modal
          ctx={ctx}
          open
          onOpenChange={(abierto) => {
            if (!abierto) setClaveActiva(null);
          }}
        />
      )}

      <div className="sticky top-0 z-30 border-b border-border bg-primary/5 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            onClick={seleccion.limpiar}
            disabled={isPending}
            aria-label="Salir del modo selección"
          >
            <X className="h-4.5 w-4.5" />
          </Button>

          <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
            {etiquetaConteo}
          </span>

          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}

          <div className="flex-1" />

          {/* Acciones prioritarias: solo desktop. En mobile todo vive en el
              sheet, que da targets grandes y crece sin romper el layout. */}
          <div className="hidden sm:flex items-center gap-1">
            {enBarra.map((accion) => {
              const motivo = accion.bloqueada?.(ctx) ?? null;
              const Icono = accion.icono;
              return (
                <Button
                  key={accion.clave}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  disabled={isPending || motivo !== null}
                  title={motivo ?? undefined}
                  onClick={() => activar(accion)}
                >
                  <Icono className="h-4 w-4 mr-1.5" />
                  {accion.label(ctx)}
                </Button>
              );
            })}
          </div>

          {/* Desktop: dropdown anclado al botón, solo si hay overflow. */}
          {enMenu.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="hidden sm:inline-flex h-9 w-9"
                    disabled={isPending}
                    aria-label="Más acciones"
                  >
                    <MoreHorizontal className="h-4.5 w-4.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {enMenu.map((accion, i) => {
                    const motivo = accion.bloqueada?.(ctx) ?? null;
                    const Icono = accion.icono;
                    const anterior = enMenu[i - 1];
                    return (
                      <div key={accion.clave}>
                        {anterior && anterior.grupo !== accion.grupo && (
                          <DropdownMenuSeparator />
                        )}
                        <DropdownMenuItem
                          disabled={motivo !== null}
                          title={motivo ?? undefined}
                          variant={
                            accion.grupo === "peligro" ? "destructive" : undefined
                          }
                          onSelect={() => activar(accion)}
                        >
                          <Icono className="h-4 w-4" />
                          {accion.label(ctx)}
                        </DropdownMenuItem>
                      </div>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
          )}

          {/* Mobile: bottom sheet con TODAS las acciones, no solo las del
              overflow — en mobile la barra no muestra ninguna, así que este
              botón es el único acceso y no puede depender de que sobre algo. */}
          {acciones.length > 0 && (
              <Sheet open={sheetAbierto} onOpenChange={setSheetAbierto}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:hidden h-9 w-9"
                    disabled={isPending}
                    aria-label="Acciones sobre la selección"
                  >
                    <MoreHorizontal className="h-4.5 w-4.5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="p-0 gap-0">
                  <SheetHeader className="border-b border-border p-4 text-left">
                    <SheetTitle className="text-base">
                      {etiquetaConteo}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col p-2 pb-6 max-h-[60vh] overflow-y-auto">
                    {acciones.map((accion, i) => {
                      const motivo = accion.bloqueada?.(ctx) ?? null;
                      const Icono = accion.icono;
                      const anterior = acciones[i - 1];
                      return (
                        <div key={accion.clave}>
                          {anterior && anterior.grupo !== accion.grupo && (
                            <div className="my-1 h-px bg-border" />
                          )}
                          <button
                            type="button"
                            disabled={motivo !== null}
                            onClick={() => activar(accion)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-sm font-medium transition-colors disabled:opacity-40 ${
                              accion.grupo === "peligro"
                                ? "text-destructive hover:bg-destructive/10"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <Icono className="h-4.5 w-4.5 shrink-0" />
                            <span className="flex-1">{accion.label(ctx)}</span>
                            {motivo && (
                              <span className="text-[11px] font-normal text-muted-foreground max-w-32 text-right leading-tight">
                                {motivo}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
          )}
        </div>

        {/* Franja de alcance, estilo Gmail: aparece solo cuando la página
            entera está marcada y todavía hay más atrás del corte de página. */}
        {seleccion.paginaCompleta &&
          !seleccion.filtroCompleto &&
          seleccion.totalFiltrado > seleccion.cantidad && (
            <div className="border-t border-border/60 bg-primary/10 px-3 py-1.5 text-center text-xs text-foreground">
              Seleccionaste los {seleccion.cantidad} de esta página.{" "}
              <button
                type="button"
                onClick={seleccion.seleccionarTodoElFiltro}
                className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
              >
                Seleccionar los {seleccion.totalFiltrado} que coinciden con los
                filtros
              </button>
            </div>
          )}

        {seleccion.filtroCompleto && seleccion.totalFiltrado > 1 && (
          <div className="border-t border-border/60 bg-primary/10 px-3 py-1.5 text-center text-xs text-foreground">
            Están seleccionados los {seleccion.totalFiltrado} productos que
            coinciden con los filtros.{" "}
            <button
              type="button"
              onClick={seleccion.limpiar}
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
            >
              Deseleccionar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
