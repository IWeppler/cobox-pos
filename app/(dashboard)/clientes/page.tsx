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

  // Traemos los clientes, los métodos de pago y la config de entrega mínima
  const [clientesRes, metodosRes, configRes] = await Promise.all([
    getClientesAction(),
    supabase.from("metodos_pago").select("*").eq("activo", true),
    supabase.from("configuracion_pos").select("cc_anticipo_default").single(),
  ]);

  const clientes = clientesRes.data || [];
  const metodosPago = metodosRes.data || [];
  const entregaMinimaActiva = (configRes.data?.cc_anticipo_default ?? 0) > 0;

  return (
    <div className="mx-auto pb-12 space-y-6">
      <ClientsView
        clientes={clientes}
        metodosPago={metodosPago}
        entregaMinimaActiva={entregaMinimaActiva}
      />
    </div>
  );
}
