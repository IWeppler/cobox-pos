"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { conNegocio, queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import {
  sincronizarCatalogo,
  type RespuestaCatalogo,
} from "@/shared/lib/sincronizar-catalogo";

const CATALOGO_STALE_TIME_MS = 3 * 60 * 1000;

/** Cuánto sobrevive el catálogo, en memoria y en el celular. Ver
 * `shared/lib/cache-offline.ts`. */
const CATALOGO_GC_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * EL catálogo del panel, para /pos y para /stock.
 *
 * UNA SOLA ENTRADA de React Query para las dos pantallas: ir de una a la otra
 * no vuelve a bajar nada. Ver `shared/actions/catalogo-panel.ts` para los
 * números.
 *
 * EXISTE COMO HOOK, y no como dos `useQuery` iguales copiados, por el
 * `queryFn`: leer la copia anterior del cache para poder pedir solo el delta
 * es lógica que las dos pantallas TIENEN que compartir. Con dos copias, la que
 * se olvide de sincronizar por delta se lleva puesto el ahorro entero sin que
 * nada falle — cada visita a esa pantalla vuelve a bajar el catálogo completo
 * y deja el cursor donde estaba.
 *
 * El dato que devuelve es siempre un `CatalogoPanel` completo, haya venido por
 * delta o entero: la pantalla no puede notar la diferencia.
 */
export function useCatalogoPanel() {
  const negocioActivo = useNegocioActivo();
  const queryClient = useQueryClient();
  const queryKey = conNegocio(queryKeys.catalogo, negocioActivo?.id);

  return useQuery({
    queryKey,
    queryFn: async () => {
      // La copia local sale del cache de React Query, que es el mismo que el
      // provider hidrata desde IndexedDB al abrir la app. O sea que la primera
      // sincronización después de reabrir la PWA ya arranca con cursor y baja
      // solo lo que cambió mientras estuvo cerrada.
      const anterior = queryClient.getQueryData<RespuestaCatalogo>(queryKey);
      return sincronizarCatalogo(anterior?.data);
    },
    staleTime: CATALOGO_STALE_TIME_MS,
    // `gcTime` largo y explícito: sin esto React Query descarta la query a los
    // 5 minutos de no usarse, y el guardado en disco que viene después ya no la
    // encuentra. O sea que el cache offline se vaciaba justo después de un rato
    // sin tocar la app — que es cuando hace falta. Y con la sync incremental
    // cuesta más todavía: perder la copia local es perder el cursor.
    gcTime: CATALOGO_GC_TIME_MS,
  });
}
