import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ReportesFilterbar } from "@/features/reports/ui/reportes-filterbar";
import { obtenerMovimientosStockAction } from "@/features/stock/actions/get-movimientos-stock";
import { MovimientosTable } from "@/features/stock/ui/movimientos-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}

export default async function MovimientosStockPage({
  searchParams,
}: Readonly<PageProps>) {
  const params = await searchParams;
  const periodoParam = params.periodo || "mes";
  const desdeParam = params.desde;
  const hastaParam = params.hasta;

  // Mismo cálculo de rango que app/(dashboard)/reportes/page.tsx, para que
  // el mismo <ReportesFilterbar/> (periodo/desde/hasta en la URL) resuelva
  // igual acá — sin esto la tabla crece sin límite con el tiempo.
  const now = new Date();
  let startDate = new Date(0);
  let endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  if (periodoParam === "hoy") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (periodoParam === "7dias") {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);
  } else if (periodoParam === "30dias") {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);
  } else if (periodoParam === "mes") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (periodoParam === "mes_anterior") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (periodoParam === "anio") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (periodoParam === "personalizado" && desdeParam) {
    startDate = new Date(`${desdeParam}T00:00:00`);
    if (hastaParam) {
      endDate = new Date(`${hastaParam}T23:59:59`);
    }
  }

  const { data: movimientos, error } = await obtenerMovimientosStockAction({
    fechaDesde: startDate.toISOString(),
    fechaHasta: endDate.toISOString(),
  });

  return (
    <div className="space-y-6 mx-auto p-2">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-4">
          <Link href="/stock" className="shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Movimientos de Stock
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Historial de ingresos y egresos: remitos, ventas, bajas,
              devoluciones y ajustes manuales.
            </p>
          </div>
        </div>

        <ReportesFilterbar />
      </div>

      {error ? (
        <div className="p-8 text-center text-destructive">{error}</div>
      ) : (
        <MovimientosTable movimientos={movimientos ?? []} />
      )}
    </div>
  );
}
