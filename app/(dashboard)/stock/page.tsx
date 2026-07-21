import { Suspense } from "react";
import { StockView } from "@/features/stock/ui/stock-view";
import { Skeleton } from "@/shared/ui/skeleton";
import { getStockIndexAction } from "@/features/stock/actions/get-product";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRole = "VENDEDOR";
  if (user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", user.id)
      .single();
    if (perfil) userRole = perfil.rol;
  }

  const [result, configRes] = await Promise.all([
    getStockIndexAction(),
    supabase
      .from("configuracion_pos")
      .select("posName, mostrar_sin_stock")
      .single(),
  ]);

  if (result.error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20 p-6 text-center">
        <p className="font-medium">{result.error}</p>
      </div>
    );
  }

  const nombreComercio = configRes.data?.posName || "Tienda Online";
  const mostrarSinStock = configRes.data?.mostrar_sin_stock ?? true;

  return (
    <div className="space-y-6 mx-auto">
      <Suspense fallback={<StockSkeleton />}>
        <StockView
          productosIndice={result.data ?? []}
          userRole={userRole}
          nombreComercio={nombreComercio}
          mostrarSinStock={mostrarSinStock}
        />
      </Suspense>
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
