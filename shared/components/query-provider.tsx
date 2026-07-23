"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
