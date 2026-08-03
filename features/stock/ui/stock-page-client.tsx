"use client";

import { useQuery } from "@tanstack/react-query";
import { getStockPageDataAction } from "@/features/stock/actions/get-product";
import { conNegocio, queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { StockView } from "@/features/stock/ui/stock-view";
import { Skeleton } from "@/shared/ui/skeleton";
import { RUBRO_DEFAULT } from "@/entities/config/types";

const CATALOG_STALE_TIME_MS = 3 * 60 * 1000;

export function StockPageClient({ userRole }: { userRole: string }) {
  const negocioActivo = useNegocioActivo();
  const { data, isLoading, error } = useQuery({
    queryKey: conNegocio(queryKeys.stock.index, negocioActivo?.id),
    queryFn: getStockPageDataAction,
    staleTime: CATALOG_STALE_TIME_MS,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 mx-auto px-2 md:px-4">
        <StockSkeleton />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20 p-6 text-center m-4">
        <p className="font-medium">
          {data?.error || "No se pudo cargar el stock."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mx-auto">
      <StockView
        productosIndice={data?.data?.productosIndice ?? []}
        userRole={userRole}
        nombreComercio={data?.data?.nombreComercio ?? "Tienda Online"}
        mostrarSinStock={data?.data?.mostrarSinStock ?? true}
        rubro={data?.data?.rubro ?? RUBRO_DEFAULT}
      />
    </div>
  );
}

function StockSkeleton() {
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
