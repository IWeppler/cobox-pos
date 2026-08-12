import { CrearNegocioForm } from "@/features/auth/ui/crear-negocio-form";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Crear negocio | Comerz",
};

export default async function CrearNegocioPage() {
  // Solo los planes ACTIVOS y en el orden de la grilla: el primero es el de
  // entrada y queda preseleccionado. La policy de `planes` es de lectura
  // pública, así que no hace falta sesión para listarlos — pero crear el
  // negocio sí la exige (la RPC corta sin auth.uid()).
  const supabase = createClient(await cookies());
  const { data: planes } = await supabase
    .from("planes")
    .select("id, nombre, descripcion, precio_mensual")
    .eq("activo", true)
    .order("orden", { ascending: true, nullsFirst: false });

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Creá tu negocio</h1>
          <p className="text-sm text-muted-foreground">
            Quedás como dueño, con acceso total. Después podés invitar a tu
            equipo desde Configuración.
          </p>
        </div>

        <CrearNegocioForm planes={planes ?? []} />
      </div>
    </main>
  );
}
