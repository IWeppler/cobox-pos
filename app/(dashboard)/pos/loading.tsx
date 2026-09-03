import { Skeleton } from "@/shared/ui/skeleton";

/**
 * Lo que se ve APENAS se clickea Vender en el sidebar.
 *
 * QUÉ ARREGLA. Medido en `/ventas → /pos`, con el catálogo YA en memoria de
 * React Query: 660 ms hasta que cambia algo en pantalla, y 661 ms hasta que es
 * usable. O sea que cuando los datos ya están, **el 100% del tiempo es esto**:
 * la espera del RSC de la ruta, con la pantalla anterior congelada y el
 * sidebar todavía marcando Ventas.
 *
 * Ese piso lo bajó a la mitad el arreglo del middleware (~346 ms de los dos
 * viajes que hacía por request). Lo que queda lo tapa este archivo: la
 * navegación commitea al instante, el sidebar marca Vender en el click, y acá
 * aparece la forma del POS mientras el server component resuelve.
 *
 * POR QUÉ ESTA FORMA. Imita el shell real: columna izquierda con el buscador y
 * la grilla, columna derecha con el ticket. Es importante que el buscador esté
 * dibujado en el mismo lugar donde va a aparecer el de verdad — es lo primero
 * que toca la vendedora, y que salte de posición al cargar es peor que
 * esperarlo quieto.
 *
 * Ocho tarjetas y no 24: son las que entran en la primera pantalla. Dibujar
 * las 24 sería pagar render por algo que se reemplaza en menos de un segundo.
 *
 * OJO, esto NO reemplaza al `GrillaSkeleton` de `pos-terminal.tsx`. Son dos
 * momentos distintos y encadenados: acá se está resolviendo LA RUTA; aquel se
 * dibuja después, cuando el shell ya es real y lo que falta es el catálogo.
 * Por eso las dos grillas usan las mismas columnas y la misma proporción de
 * tarjeta: cuando una reemplaza a la otra, no se mueve nada.
 */
export default function Loading() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      {/* Izquierda: buscador + grilla */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <div className="p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <Skeleton className="h-10 w-32 rounded-lg shrink-0 hidden sm:block" />
          </div>
          {/* Fila de pills de categoría */}
          <div className="flex gap-2 overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-lg shrink-0" />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-2">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border overflow-hidden"
              >
                <Skeleton className="aspect-square w-full rounded-none" />
                <div className="p-2 space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Derecha: el ticket. Solo en desktop, igual que CartPanelAdmin. */}
      <div className="hidden lg:flex w-80 shrink-0 flex-col border-l border-border p-4 gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-px w-full" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
