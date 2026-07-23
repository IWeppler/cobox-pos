import { StockPageClient } from "@/features/stock/ui/stock-page-client";
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

  return <StockPageClient userRole={userRole} />;
}
