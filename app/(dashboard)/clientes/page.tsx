import { getClientesAction } from "@/features/clients/actions/manage-clients";
import { ClientsView } from "@/features/clients/ui/clients-view";
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

  // Traemos los clientes y los métodos de pago
  const [clientesRes, metodosRes] = await Promise.all([
    getClientesAction(),
    supabase.from("metodos_pago").select("*").eq("activo", true),
  ]);

  const clientes = clientesRes.data || [];
  const metodosPago = metodosRes.data || [];

  return (
    <div className="mx-auto pb-12 space-y-6">
      <ClientsView clientes={clientes} metodosPago={metodosPago} />
    </div>
  );
}
