"use client";

import { useQuery } from "@tanstack/react-query";
import { getCatalogoPanelAction } from "@/shared/actions/catalogo-panel";
import { conNegocio, queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { StockView } from "@/features/stock/ui/stock-view";
// El MISMO esqueleto que dibuja `stock/loading.tsx`. Ver ahí por qué se
// comparte: son dos cargas seguidas (la ruta y después el catálogo) y con dos
// dibujos distintos la pantalla parpadearía dos veces antes de mostrar datos.
import { StockSkeleton } from "@/features/stock/ui/stock-skeleton";
import { AvisoDatosGuardados } from "@/shared/components/aviso-datos-guardados";
import { RUBRO_DEFAULT } from "@/entities/config/types";
import type { UsoDelPlan } from "@/features/planes/actions/uso-del-plan";

const CATALOG_STALE_TIME_MS = 3 * 60 * 1000;

/** Cuánto sobrevive el catálogo, en memoria y en el celular. Ver
 * `shared/lib/cache-offline.ts`. */
const CACHE_OFFLINE_MS = 24 * 60 * 60 * 1000;

export function StockPageClient({
  userRole,
  uso,
}: {
  userRole: string;
  uso?: UsoDelPlan | null;
}) {
  const negocioActivo = useNegocioActivo();
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    // La MISMA entrada que usa /pos: una sola consulta para las dos
    // pantallas. Acá el catálogo se usa TAL CUAL viene —sin filtrar— porque
    // Inventario tiene que mostrar también lo despublicado: un producto que
    // se sacó de la vidriera hay que poder verlo para corregirlo.
    queryKey: conNegocio(queryKeys.catalogo, negocioActivo?.id),
    queryFn: getCatalogoPanelAction,
    staleTime: CATALOG_STALE_TIME_MS,
    // `gcTime` largo y explícito: sin esto React Query descarta la query a
    // los 5 minutos de no usarse, y el guardado en disco que viene después
    // ya no la encuentra. O sea que el cache offline se vaciaba justo
    // después de un rato sin tocar la app — que es cuando hace falta.
    gcTime: CACHE_OFFLINE_MS,
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
      {/* Mismo criterio que en Vender: el inventario puede estar saliendo
          del celular, y hay que decirlo. */}
      <div className="px-2 pt-2 empty:hidden md:px-4">
        <AvisoDatosGuardados actualizadoEn={dataUpdatedAt} que="Inventario" />
      </div>

      {/* El medidor del tope de productos vive SOLO en Perfil > Suscripción:
          acá se comía una banda arriba del inventario todos los días para un
          dato que se mira una vez por mes. El aviso donde sí importa sigue
          estando: al llegar al tope, las puertas de alta de mercadería se
          apagan y explican por qué (ver stock-filters-toolbar). */}
      <StockView
        productosIndice={data?.data?.productos ?? []}
        userRole={userRole}
        nombreComercio={data?.data?.nombreComercio ?? "Tienda Online"}
        mostrarSinStock={data?.data?.mostrarSinStock ?? true}
        rubro={data?.data?.rubro ?? RUBRO_DEFAULT}
        productosDelNegocio={uso?.productos}
      />
    </div>
  );
}
