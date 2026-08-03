import {
  getPanelComerzAction,
  getPlanesAction,
} from "@/features/admin/actions/metricas-comerz";
import { FilaNegocio } from "@/features/admin/ui/fila-negocio";
import { formatearMoneda } from "@/shared/utils/formatters";

export const dynamic = "force-dynamic";

export const metadata = { title: "Comercios | Comerz" };

export default async function AdminNegociosPage() {
  const [{ negocios, metricas }, planes] = await Promise.all([
    getPanelComerzAction(),
    getPlanesAction(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comercios</h1>
          <p className="text-sm text-muted-foreground">
            Gestión centralizada de todos los clientes de Comerz.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {formatearMoneda(metricas.mrr)}
          </span>{" "}
          de MRR · {negocios.length} comercio
          {negocios.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-4xl">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">Negocio</th>
              <th className="px-4 py-3 font-semibold">Dueño</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Vence</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Soporte</th>
            </tr>
          </thead>
          <tbody>
            {negocios.map((negocio) => (
              <FilaNegocio key={negocio.id} negocio={negocio} planes={planes} />
            ))}
            {negocios.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Todavía no hay comercios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        &quot;Entrar&quot; abre el POS de ese comercio con tu propia sesión, sin
        pedirle la contraseña a nadie. Mientras dure, una barra arriba te
        recuerda en qué negocio estás y te deja salir.
      </p>
    </div>
  );
}
