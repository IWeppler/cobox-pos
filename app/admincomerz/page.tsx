import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Inbox,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getPanelComerzAction } from "@/features/admin/actions/metricas-comerz";
import { getSolicitudesAction } from "@/features/admin/actions/solicitudes-actions";
import { formatearMoneda } from "@/shared/utils/formatters";

export const dynamic = "force-dynamic";

export const metadata = { title: "Panel Cobox" };

export default async function AdminCoboxPage() {
  const [{ negocios, metricas }, solicitudes] = await Promise.all([
    getPanelComerzAction(),
    getSolicitudesAction(),
  ]);

  // Un lead sin contestar es plata en la puerta: va arriba de todo.
  const solicitudesNuevas = solicitudes.filter(
    (s) => s.estado === "NUEVA",
  ).length;

  const ultimos = [...negocios]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel Cobox</h1>
        <p className="text-sm text-muted-foreground">
          Cómo viene el negocio, de un vistazo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo="MRR"
          valor={formatearMoneda(metricas.mrr)}
          detalle={`${metricas.activos} comercio${metricas.activos === 1 ? "" : "s"} activo${metricas.activos === 1 ? "" : "s"}`}
          icono={<Wallet className="w-4 h-4" />}
        />
        <Tarjeta
          titulo="Altas de la semana"
          valor={String(metricas.altasSemana)}
          detalle="últimos 7 días"
          icono={<TrendingUp className="w-4 h-4 text-success" />}
        />
        <Tarjeta
          titulo="Bajas"
          valor={String(metricas.bajasMes)}
          detalle="últimos 30 días"
          icono={<TrendingDown className="w-4 h-4 text-danger" />}
        />
        <Tarjeta
          titulo="Comercios activos"
          valor={String(metricas.activos)}
          detalle={
            metricas.suspendidos > 0
              ? `${metricas.suspendidos} fuera de servicio`
              : "ninguno suspendido"
          }
          icono={<Building2 className="w-4 h-4" />}
        />
      </div>

      {/* Lo que necesita acción, dicho sin vueltas. */}
      {(solicitudesNuevas > 0 ||
        metricas.sinPlan > 0 ||
        metricas.porVencer > 0) && (
        <div className="space-y-2">
          {solicitudesNuevas > 0 && (
            <Aviso
              icono={<Inbox className="w-4 h-4 text-primary shrink-0" />}
              texto={
                <>
                  <strong>
                    {solicitudesNuevas} solicitud
                    {solicitudesNuevas === 1 ? "" : "es"} sin contestar
                  </strong>
                  {" — "}
                  <Link
                    href="/admincomerz/solicitudes"
                    className="text-primary hover:underline font-medium"
                  >
                    verlas ahora
                  </Link>
                  .
                </>
              }
            />
          )}
          {metricas.sinPlan > 0 && (
            <Aviso
              icono={
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              }
              texto={
                <>
                  <strong>
                    {metricas.sinPlan} comercio
                    {metricas.sinPlan === 1 ? "" : "s"} sin plan asignado
                  </strong>
                  {" — "}no suman al MRR hasta que les pongas uno.
                </>
              }
            />
          )}
          {metricas.porVencer > 0 && (
            <Aviso
              icono={
                <CalendarClock className="w-4 h-4 text-warning shrink-0" />
              }
              texto={
                <>
                  <strong>
                    {metricas.porVencer} vence
                    {metricas.porVencer === 1 ? "" : "n"} en menos de 15 días
                  </strong>
                  {" — "}hora de renovar.
                </>
              }
            />
          )}
        </div>
      )}

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Últimas altas</h2>
          <Link
            href="/admincomerz/negocios"
            className="text-xs text-primary hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {ultimos.map((n) => (
            <li
              key={n.id}
              className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{n.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {n.duenio ?? "sin dueño asignado"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium">
                  {n.plan_nombre ?? "Sin plan"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleDateString("es-AR")}
                </p>
              </div>
            </li>
          ))}
          {ultimos.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              Todavía no hay comercios.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  icono,
}: Readonly<{
  titulo: string;
  valor: string;
  detalle: string;
  icono: React.ReactNode;
}>) {
  return (
    <div className="border border-border rounded-xl bg-card p-4 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wide">
          {titulo}
        </span>
        {icono}
      </div>
      <p className="text-2xl font-bold tracking-tight">{valor}</p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

function Aviso({
  icono,
  texto,
}: Readonly<{ icono: React.ReactNode; texto: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-warning/30 bg-warning/10 text-sm">
      {icono}
      <span>{texto}</span>
    </div>
  );
}
