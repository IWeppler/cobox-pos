// src/app/admin-cobox/negocios/page.tsx
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Building2, KeyRound, Calendar } from "lucide-react";
import { iniciarImpersonationAction } from "@/features/admin/actions/impersonate";

export default async function AdminNegociosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Consultamos todos los negocios y sus planes asociados
  const { data: negocios } = await supabase
    .from("negocios")
    .select(
      `
      id,
      nombre,
      estado,
      plan_vencimiento,
      planes (
        nombre,
        precio_mensual
      )
    `,
    )
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Comercios (Tenants)
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestión centralizada de todos los clientes de Cobox.
        </p>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">Negocio</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Vencimiento</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(negocios ?? []).map((negocio: any) => (
              <tr
                key={negocio.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  {negocio.nombre}
                </td>
                <td className="px-4 py-3">
                  <span className="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-semibold">
                    {negocio.planes?.nombre ?? "Sin Plan"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      negocio.estado === "activo" ? "bg-success" : "bg-warning"
                    }`}
                  />
                  <span className="capitalize">{negocio.estado}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {negocio.plan_vencimiento
                    ? new Date(negocio.plan_vencimiento).toLocaleDateString()
                    : "Ilimitado"}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Botón de Modo Dios */}
                  <form
                    action={iniciarImpersonationAction.bind(null, negocio.id)}
                  >
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-lg transition-colors border border-border"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-warning" />
                      Modo Dios
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
