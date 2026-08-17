import { PosPageClient } from "@/features/pos/ui/pos-page-client";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/shared/config/supabase/usuario-actual";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificamos permisos
  const { user } = await getUsuarioActual();
  if (!user) redirect("/auth");

  return <PosPageClient />;
}
