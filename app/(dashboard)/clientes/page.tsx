import { ClientsPageClient } from "@/features/clients/ui/clients-page-client";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificación de sesión
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: rolActual } = await supabase.rpc("rol_actual");
  const userRole = rolActual || "VENDEDOR";
  const isAdmin = userRole === "ADMIN";

  return <ClientsPageClient isAdmin={isAdmin} />;
}
