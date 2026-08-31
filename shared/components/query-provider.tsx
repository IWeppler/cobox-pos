"use client";

import { useEffect, useRef, useState } from "react";
import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  guardarCacheOffline,
  leerCacheOffline,
} from "@/shared/lib/cache-offline";
import { esQueryPersistible } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";

/** Cuánto se espera a IndexedDB antes de dibujar igual. Leer el cache tarda
 * milisegundos; este techo existe para que un IndexedDB trabado —Safari con
 * el almacenamiento bloqueado -- no deje la app en blanco. */
const TOPE_HIDRATACION_MS = 1000;

/** El guardado se agrupa: una carga de catálogo dispara varios eventos de
 * cache seguidos y no tiene sentido escribir en disco en cada uno. */
const ESPERA_GUARDADO_MS = 1000;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Default a 0: cada query de catálogo pide su propio staleTime
            // explícito (3 min). Caja/turnos no pasan por acá — siguen con
            // su polling propio en shared/store/caja-status-store.ts.
            staleTime: 0,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const negocioActivo = useNegocioActivo();
  const negocioId = negocioActivo?.id ?? null;

  // Se dibuja recién cuando el cache guardado ya está adentro del cliente. Sin
  // esta espera, una apertura sin señal muestra primero el error de red y solo
  // después aparecen los datos: el parpadeo hace pensar que se rompió algo.
  const [cacheLeido, setCacheLeido] = useState(false);
  // Sin negocio resuelto no hay entrada que leer: esperar algo que no va a
  // llegar sería peor que no cachear. Se deriva en vez de setearlo en un
  // efecto, que además dispara un render en cascada.
  const listo = cacheLeido || !negocioId;

  useEffect(() => {
    if (!negocioId) return;

    let vigente = true;
    const destrabar = () => {
      if (vigente) setCacheLeido(true);
    };

    const reloj = setTimeout(destrabar, TOPE_HIDRATACION_MS);

    leerCacheOffline(negocioId)
      .then((guardado) => {
        if (!vigente || !guardado) return;
        // `hydrate` no pisa lo que ya esté fresco en memoria: si una query ya
        // respondió por red mientras leíamos el disco, gana la de red.
        hydrate(queryClient, guardado.estado);
      })
      .finally(() => {
        clearTimeout(reloj);
        destrabar();
      });

    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [negocioId, queryClient]);

  const guardadoPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!negocioId || !listo) return;

    const guardar = () => {
      const estado = dehydrate(queryClient, {
        // Solo catálogo, y solo lo que respondió bien: persistir un error
        // sería restaurar mañana una pantalla rota de hoy. Ver
        // `esQueryPersistible`, que es donde está la decisión de qué entra.
        shouldDehydrateQuery: (query) =>
          query.state.status === "success" && esQueryPersistible(query.queryKey),
      });

      // Un dehydrate SIN queries no se guarda: pisaría el catálogo bueno
      // con nada. Pasa cuando React Query recolecta la query por gcTime y
      // el próximo evento de cache dispara el guardado con la memoria ya
      // vacía — o sea, justo después de un rato sin usar la app, que es
      // cuando el cache más falta hace.
      if (estado.queries.length === 0) return;

      void guardarCacheOffline(negocioId, estado);
    };

    const suscripcion = queryClient.getQueryCache().subscribe(() => {
      if (guardadoPendiente.current) clearTimeout(guardadoPendiente.current);
      guardadoPendiente.current = setTimeout(guardar, ESPERA_GUARDADO_MS);
    });

    return () => {
      suscripcion();
      if (guardadoPendiente.current) clearTimeout(guardadoPendiente.current);
    };
  }, [negocioId, listo, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {listo ? children : null}
    </QueryClientProvider>
  );
}
