import { ClientsPageClient } from "@/features/clients/ui/clients-page-client";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/shared/config/supabase/usuario-actual";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificación de sesión
  const { user } = await getUsuarioActual();
  if (!user) redirect("/auth");

  const { data: rolActual } = await supabase.rpc("rol_actual");
  const userRole = rolActual || "VENDEDOR";
  const isAdmin = userRole === "ADMIN";

  return <ClientsPageClient isAdmin={isAdmin} />;
}
