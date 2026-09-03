import { Skeleton } from "@/shared/ui/skeleton";

/**
 * El esqueleto de Inventario, compartido por DOS estados distintos.
 *
 * POR QUÉ COMPARTIDO. La pantalla pasa por dos cargas seguidas y son de cosas
 * diferentes:
 *
 *   1. `app/(dashboard)/stock/loading.tsx` — mientras Next resuelve el server
 *      component de la ruta. Es lo que hace que la navegación se sienta
 *      inmediata: sin loading boundary, el click deja la pantalla ANTERIOR
 *      congelada 863 ms (medido) y ni siquiera se ilumina el ítem del sidebar.
 *   2. `stock-page-client.tsx` — mientras React Query trae el catálogo.
 *
 * Si cada una dibujara su propio esqueleto, la pantalla parpadearía dos veces
 * con formas distintas antes de mostrar datos. Con el mismo componente, la
 * transición de (1) a (2) es invisible: son literalmente los mismos píxeles.
 *
 * Va en su propio archivo y no exportado desde `stock-page-client` porque ese
 * es `"use client"`, y `loading.tsx` no tiene por qué arrastrar el bundle del
 * cliente para dibujar cinco rectángulos.
 */
export function StockSkeleton() {
  return (
    <div className="space-y-4 mt-8">
      <div className="flex justify-between items-center">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="h-12 border-b border-border bg-muted/50 px-4 flex items-center">
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="p-4 border-b border-border flex items-center gap-4"
          >
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
