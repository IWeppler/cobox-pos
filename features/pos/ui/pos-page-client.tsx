"use client";

import { useQuery } from "@tanstack/react-query";
import { getPosCatalogDataAction } from "@/shared/actions/store-actions";
import { conNegocio, queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { PosTerminal } from "@/features/pos/ui/pos-terminal";
import { CartPanelAdmin } from "@/features/pos/ui/cart-panel-admin";
import { Skeleton } from "@/shared/ui/skeleton";
import { RUBRO_DEFAULT } from "@/entities/config/types";

const CATALOG_STALE_TIME_MS = 3 * 60 * 1000;

export function PosPageClient() {
  const negocioActivo = useNegocioActivo();
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
      <PosTerminal
        productos={data?.data?.productos ?? []}
        categorias={data?.data?.categorias ?? []}
        permitirVentaSinStock={data?.data?.permitirVentaSinStock}
        nombreComercio={data?.data?.nombreComercio}
        mostrarSinStock={data?.data?.mostrarSinStock}
        rubro={data?.data?.rubro ?? RUBRO_DEFAULT}
      />
      <CartPanelAdmin />
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
