import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { getStockAction } from "@/features/stock/actions/get-product";
import { CargaRapidaPageClient } from "@/features/carga-rapida/ui/carga-rapida-page-client";

export const dynamic = "force-dynamic";

export default async function CargaRapidaPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: productos } = await getStockAction();

  return <CargaRapidaPageClient productosIniciales={productos ?? []} />;
}
