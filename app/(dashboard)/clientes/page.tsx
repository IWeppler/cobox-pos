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

  let userRole = "VENDEDOR";
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (perfil) userRole = perfil.rol;
  const isAdmin = userRole === "ADMIN";

  return <ClientsPageClient isAdmin={isAdmin} />;
}
