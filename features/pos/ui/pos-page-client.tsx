"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPosCatalogDataAction } from "@/shared/actions/store-actions";
import { conNegocio, queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { PosTerminal } from "@/features/pos/ui/pos-terminal";
import { CartPanelAdmin } from "@/features/pos/ui/cart-panel-admin";
import { Skeleton } from "@/shared/ui/skeleton";
import { RUBRO_DEFAULT } from "@/entities/config/types";

const CATALOG_STALE_TIME_MS = 3 * 60 * 1000;

interface PosPageClientProps {
  /** Permiso `clientes.cobrar_cc`, resuelto en la página (server). Decide si
   * la barra del POS ofrece "Cobrar deuda". */
  puedeCobrarCuentaCorriente?: boolean;
}

export function PosPageClient({
  puedeCobrarCuentaCorriente = false,
}: Readonly<PosPageClientProps> = {}) {
  const negocioActivo = useNegocioActivo();
  // `?q=` es cómo entra un producto elegido en la paleta (Ctrl+K): en vez de
  // agregarlo al ticket a ciegas —con talles y colores, elegir la variante es
  // una decisión— deja el POS con esa búsqueda hecha.
  const busquedaInicial = useSearchParams().get("q") ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: conNegocio(queryKeys.pos.productos, negocioActivo?.id),
    queryFn: getPosCatalogDataAction,
    staleTime: CATALOG_STALE_TIME_MS,
  });

  if (isLoading) {
    return <PosSkeleton />;
  }

  if (error || data?.error) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20 p-6 text-center">
        <p className="font-medium">
          {data?.error || "No se pudo cargar el catálogo."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      {/* La `key` remonta el terminal cuando llega otra búsqueda desde la
          paleta. Es lo que hace que elegir un segundo producto sin salir de
          /pos vuelva a filtrar: sin ella, `busquedaInicial` solo se leería en
          el primer render. Remontar no toca el carrito, que vive en el store. */}
      <PosTerminal
        key={busquedaInicial}
        busquedaInicial={busquedaInicial}
        productos={data?.data?.productos ?? []}
        categorias={data?.data?.categorias ?? []}
        permitirVentaSinStock={data?.data?.permitirVentaSinStock}
        nombreComercio={data?.data?.nombreComercio}
        mostrarSinStock={data?.data?.mostrarSinStock}
        rubro={data?.data?.rubro ?? RUBRO_DEFAULT}
        puedeCobrarCuentaCorriente={puedeCobrarCuentaCorriente}
      />
      <CartPanelAdmin rubro={data?.data?.rubro ?? RUBRO_DEFAULT} />
    </div>
  );
}

function PosSkeleton() {
  return (
    <div className="flex h-full w-full gap-4 p-4">
      <div className="flex-1 space-y-4">
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="hidden lg:block w-80 rounded-lg" />
    </div>
  );
}
