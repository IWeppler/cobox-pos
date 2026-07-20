import { getProductosAction } from "@/shared/actions/store-actions";
import { PosTerminal } from "@/features/pos/ui/pos-terminal";
import { CartPanelAdmin } from "@/features/pos/ui/cart-panel-admin";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificamos permisos
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Traemos los datos para la terminal
  const [productosRes, categoriasRes, configRes] = await Promise.all([
    getProductosAction(),
    supabase
      .from("categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true }),
    supabase
      .from("configuracion_pos")
      .select("permitir_venta_sin_stock, posName, mostrar_sin_stock")
      .single(),
  ]);

  const productos = productosRes.data || [];
  const categoriasDB = categoriasRes.data || [];
  const permitirVentaSinStock =
    configRes.data?.permitir_venta_sin_stock ?? false;
  const nombreComercio = configRes.data?.posName || "Tienda Online";
  const mostrarSinStock = configRes.data?.mostrar_sin_stock ?? true;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <PosTerminal
        productos={productos}
        categorias={categoriasDB}
        permitirVentaSinStock={permitirVentaSinStock}
        nombreComercio={nombreComercio}
        mostrarSinStock={mostrarSinStock}
      />
      <CartPanelAdmin />
    </div>
  );
}
