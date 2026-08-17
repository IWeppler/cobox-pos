import { StockPageClient } from "@/features/stock/ui/stock-page-client";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { getUsoDelPlanAction } from "@/features/planes/actions/uso-del-plan";
import { getUsuarioActual } from "@/shared/config/supabase/usuario-actual";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { user } = await getUsuarioActual();

  let userRole = "VENDEDOR";
  if (user) {
    const { data: rolActual } = await supabase.rpc("rol_actual");
    if (rolActual) userRole = rolActual;
  }

  // Cuántos productos hay cargados, para el medidor del tope del plan. Se
  // cuenta en el server con `head: true` (no trae filas) en vez de derivarlo
  // de la lista de la pantalla, que viene filtrada y paginada — y que además
  // topea en 1000 por el límite de PostgREST, justo el número del plan.
  const uso = userRole === "ADMIN" ? await getUsoDelPlanAction() : null;

  return <StockPageClient userRole={userRole} uso={uso} />;
}
