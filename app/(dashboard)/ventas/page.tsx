import { getVentasAction } from "@/features/sales/actions/get-sales";
import { VentasTable } from "@/features/sales/ui/sale-table";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Venta } from "@/entities/ventas/types";
import { getUsuarioActual } from "@/shared/config/supabase/usuario-actual";
import { getRolActual } from "@/shared/config/supabase/contexto-actual";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { user } = await getUsuarioActual();

  // 2. Obtener su rol de la tabla perfiles (queda como está — todavía
  // gatea el orden "Mayor ganancia neta", fuera del alcance de este cableado)
  let userRole = "VENDEDOR";
  if (user) {
    const rolActual = await getRolActual();
    if (rolActual) userRole = rolActual;
  }

  const [puedeAnularRes, puedeVerTodasRes] = await Promise.all([
    supabase.rpc("tiene_permiso", { clave: "ventas.anular" }),
    supabase.rpc("tiene_permiso", { clave: "ventas.ver_todas" }),
  ]);
  const puedeAnular = Boolean(puedeAnularRes.data);
  const puedeVerTodas = Boolean(puedeVerTodasRes.data);

  // 3. Cargar las ventas.
  //
  // Acá también se traía `getStockAction()` —el catálogo entero con variantes,
  // 2,70 MB en Evens— para pasárselo a VentasTable como prop `productos`. La
  // prop estaba declarada en la interfaz pero el componente NUNCA la leía: se
  // descargaba y se descartaba en cada carga de /ventas.
  const ventasResponse = await getVentasAction({ soloPropias: !puedeVerTodas });

  const ventas = (ventasResponse.data || []) as unknown as Venta[];
  const error = ventasResponse.error;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      ) : (
        <VentasTable
          ventas={ventas || []}
          userRole={userRole}
          puedeAnular={puedeAnular}
        />
      )}
    </div>
  );
}
