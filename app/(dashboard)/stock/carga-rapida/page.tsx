import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { getStockAction } from "@/features/stock/actions/get-product";
import { normalizarRubro } from "@/entities/config/types";
import { CargaRapidaPageClient } from "@/features/carga-rapida/ui/carga-rapida-page-client";

export const dynamic = "force-dynamic";

export default async function CargaRapidaPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: productos }, { data: config }] = await Promise.all([
    getStockAction(),
    supabase.from("configuracion_pos").select("rubro").single(),
  ]);

  // Solo para ahorrarle al cliente el round-trip (y el spinner "Buscando en
  // el Catálogo Maestro…") cuando el comercio no es de electro. El chequeo
  // que MANDA está en buscarEnCatalogoMaestroAction: esto es UX, no seguridad.
  return (
    <CargaRapidaPageClient
      productosIniciales={productos ?? []}
      rubro={normalizarRubro(config?.rubro)}
    />
  );
}
