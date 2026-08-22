import { ClientsPageClient } from "@/features/clients/ui/clients-page-client";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/shared/config/supabase/usuario-actual";
import { getRolActual } from "@/shared/config/supabase/contexto-actual";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  // Verificación de sesión
  const { user } = await getUsuarioActual();
  if (!user) redirect("/auth");

  const rolActual = await getRolActual();
  const userRole = rolActual || "VENDEDOR";
  const isAdmin = userRole === "ADMIN";

  return <ClientsPageClient isAdmin={isAdmin} />;
}
