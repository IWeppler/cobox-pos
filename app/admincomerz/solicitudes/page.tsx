import { Inbox } from "lucide-react";
import { getSolicitudesAction } from "@/features/admin/actions/solicitudes-actions";
import { FilaSolicitud } from "@/features/admin/ui/fila-solicitud";

export const dynamic = "force-dynamic";

export const metadata = { title: "Solicitudes | Comerz" };

export default async function AdminSolicitudesPage() {
  const solicitudes = await getSolicitudesAction();

  const nuevas = solicitudes.filter((s) => s.estado === "NUEVA").length;
  const convertidas = solicitudes.filter((s) => s.estado === "CONVERTIDA").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Solicitudes</h1>
          <p className="text-sm text-muted-foreground">
            Comercios que pidieron el alta desde el login.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{nuevas}</span> sin
          contestar · {convertidas} convertida
          {convertidas === 1 ? "" : "s"}
        </p>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        {solicitudes.length > 0 ? (
          <ul className="divide-y divide-border">
            {solicitudes.map((solicitud) => (
              <FilaSolicitud key={solicitud.id} solicitud={solicitud} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Inbox className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium">Todavía no llegó ninguna solicitud</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Aparecen acá apenas alguien completa &quot;Crear mi comercio&quot;
              en la pantalla de ingreso.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Una solicitud no crea nada sola: cuando la convertís, el alta del
        negocio se hace desde Comercios.
      </p>
    </div>
  );
}
