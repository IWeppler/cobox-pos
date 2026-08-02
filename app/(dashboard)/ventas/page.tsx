import { getVentasAction } from "@/features/sales/actions/get-sales";
import { getStockAction } from "@/features/stock/actions/get-product";
import { VentasTable } from "@/features/sales/ui/sale-table";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Venta } from "@/entities/ventas/types";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Obtener su rol de la tabla perfiles (queda como está — todavía
  // gatea el orden "Mayor ganancia neta", fuera del alcance de este cableado)
  let userRole = "VENDEDOR";
  if (user) {
    const { data: rolActual } = await supabase.rpc("rol_actual");
    if (rolActual) userRole = rolActual;
  }

  const [puedeAnularRes, puedeVerTodasRes] = await Promise.all([
    supabase.rpc("tiene_permiso", { clave: "ventas.anular" }),
    supabase.rpc("tiene_permiso", { clave: "ventas.ver_todas" }),
  ]);
  const puedeAnular = Boolean(puedeAnularRes.data);
  const puedeVerTodas = Boolean(puedeVerTodasRes.data);

  // 3. Cargar las ventas y los productos
  const [ventasResponse, productosResponse] = await Promise.all([
    getVentasAction({ soloPropias: !puedeVerTodas }),
    getStockAction(),
  ]);

  const ventas = (ventasResponse.data || []) as unknown as Venta[];
  const error = ventasResponse.error;
  const productos = productosResponse.data;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      ) : (
        <VentasTable
          ventas={ventas || []}
          productos={productos || []}
          userRole={userRole}
          puedeAnular={puedeAnular}
        />
      )}
    </div>
  );
}
