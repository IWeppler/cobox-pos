import { cookies } from "next/headers";
import {
  getVentasAction,
  getPagosCuentaCorrienteAction,
} from "@/features/sales/actions/get-sales";
import { getStockAction } from "@/features/stock/actions/get-product";
import { createClient } from "@/shared/config/supabase/server";
import {
  getDashboardMetrics,
  PeriodoDashboard,
} from "@/features/dashboard/lib/get-dashboard-metrics";
import { ReportesFilterbar } from "@/features/reports/ui/reportes-filterbar";
import { getAdvisorInsights } from "@/features/reports/actions/get-advisor-insights";
import { AdvisorBanner } from "@/features/reports/ui/advisor-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { ExportacionesTab } from "@/features/exportaciones/ui/exportaciones-tab";
import { ScrollArea, ScrollBar } from "@/shared/ui/scroll-area";
import {
  Activity,
  DollarSign,
  DropletOff,
  Package,
  ShoppingCart,
  TrendingUp,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { BajasTab } from "@/features/reports/ui/bajas-tab";
import { InventarioTab } from "@/features/reports/ui/inventario-tab";
import { RentabilidadTab } from "@/features/reports/ui/rentabilidad-tab";
import { ResumenTab } from "@/features/reports/ui/resumen-tab";
import { BajaAprobadaReporte } from "@/entities/reportes/types";
import { VentasTab } from "@/features/reports/ui/ventas-tab";
import { CrmTab } from "@/features/reports/ui/crm-tab";
import { VendedoresTab } from "@/features/reports/ui/vendedores-tab";
import { Venta, VentaPago } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}

export default async function ReportesPage({
  searchParams,
}: Readonly<PageProps>) {
  const params = await searchParams;
  const periodoParam = (params.periodo as PeriodoDashboard) || "mes";
  const desdeParam = params.desde;
  const hastaParam = params.hasta;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: puedeVerVendedoresRaw } = await supabase.rpc("tiene_permiso", {
    clave: "reportes.ver_todos_empleados",
  });
  const puedeVerVendedores = Boolean(puedeVerVendedoresRaw);

  const [
    ventasResponse,
    productosResponse,
    egresosResponse,
    bajasResponse,
    clientesResponse,
    configResponse,
    pagosCuentaCorrienteResponse,
  ] = await Promise.all([
    getVentasAction(),
    getStockAction(),
    supabase.from("egresos").select("id, concepto, monto, fecha, tipo, orden_compra_id"),
    supabase
      .from("bajas")
      .select(
        "id, producto_id, variante, cantidad, motivo, creado_en, estado, perfiles(nombre)",
      )
      .eq("estado", "APROBADA"),
    supabase.from("clientes").select("*").order("nombre", { ascending: true }),
    supabase
      .from("configuracion_pos")
      .select("cc_plazo_mora, crm_dias_inactivo")
      .single(),
    getPagosCuentaCorrienteAction(),
  ]);

  const ventas = (ventasResponse.data || []) as unknown as Venta[];
  const ventasOperativas = ventas.filter(
    (venta) =>
      venta.estado_operacion !== "ANULADA" && venta.estado_pago !== "ANULADA",
  );
  const productos = productosResponse.data || [];
  const egresos = egresosResponse.data || [];
  const bajasAprobadas = (bajasResponse.data || []) as BajaAprobadaReporte[];
  const clientes = clientesResponse.data || [];
  // Cobros de deuda: aportan comisión y recargo, no ingresos (el ticket
  // fiado ya computó su total el día de la venta).
  const pagosCuentaCorriente = (pagosCuentaCorrienteResponse.data ||
    []) as unknown as VentaPago[];

  const config: Partial<ConfiguracionPOS> = configResponse.data || {};
  const plazoMora = config.cc_plazo_mora ?? 30;
  const diasInactivo = config.crm_dias_inactivo ?? 60;

  const metrics = getDashboardMetrics(
    ventasOperativas,
    productos,
    egresos,
    bajasAprobadas,
    periodoParam,
    desdeParam,
    hastaParam,
    pagosCuentaCorriente,
  );

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

  const ventasDelPeriodo =
    periodoParam === "historico"
      ? ventasOperativas
      : ventasOperativas.filter((v) => {
          const fechaVenta = new Date(v.fecha_venta);
          return fechaVenta >= startDate && fechaVenta <= endDate;
        });

  const bajasDelPeriodo =
    periodoParam === "historico"
      ? bajasAprobadas
      : bajasAprobadas.filter((baja) => {
          const fechaBaja = new Date(baja.creado_en);
          return fechaBaja >= startDate && fechaBaja <= endDate;
        });

  const costoMercaderiaVendida = metrics.ingresos - metrics.gananciaBrutaVentas;
  const insights = getAdvisorInsights(metrics);

  // yyyy-mm-dd en horario local, mismo criterio que ReportesFilterbar usa
  // para no desfasar por UTC.
  const formatLocal = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const desdeVendedores = formatLocal(startDate);
  const hastaVendedores = formatLocal(endDate);

  return (
    <div className="flex flex-col gap-4 px-4 p-2">
      <AdvisorBanner insights={insights} />

      <Tabs defaultValue="resumen" className="w-full space-y-4 mt-2">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-border/50 pb-2">
          <ScrollArea className="w-full pb-2 lg:pb-0 lg:w-auto">
            <TabsList className="bg-sidebar border border-border h-10! inline-flex w-max min-w-full sm:min-w-0">
              <TabsTrigger
                value="resumen"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground cursor-pointer transition-color shadow-none"
              >
                <Activity className="w-4 h-4 mr-2" /> Resumen
              </TabsTrigger>
              <TabsTrigger
                value="ventas"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
              >
                <ShoppingCart className="w-4 h-4 mr-2" /> Ventas
              </TabsTrigger>
              <TabsTrigger
                value="rentabilidad"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
              >
                <DollarSign className="w-4 h-4 mr-2" /> Rentabilidad
              </TabsTrigger>
              <TabsTrigger
                value="inventario"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
              >
                <Package className="w-4 h-4 mr-2" /> Inventario
              </TabsTrigger>
              <TabsTrigger
                value="bajas"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
              >
                <DropletOff className="w-4 h-4 mr-2" /> Bajas
              </TabsTrigger>
              <TabsTrigger
                value="crm"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
              >
                <Users className="w-4 h-4 mr-2" /> CRM & Cobranza
              </TabsTrigger>
              {puedeVerVendedores && (
                <TabsTrigger
                  value="vendedores"
                  className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
                >
                  <TrendingUp className="w-4 h-4 mr-2" /> Vendedores
                </TabsTrigger>
              )}
              <TabsTrigger
                value="exportaciones"
                className="rounded-sm px-2 data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:text-foreground  cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportaciones
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>

          <div className="w-full lg:w-auto flex lg:justify-end shrink-0 z-10 mb-2 lg:mb-0">
            <ReportesFilterbar />
          </div>
        </div>

        <ResumenTab
          metrics={metrics}
          ventasDelPeriodo={ventasDelPeriodo}
          periodo={periodoParam}
        />
        <VentasTab metrics={metrics} />
        <RentabilidadTab
          metrics={metrics}
          costoMercaderiaVendida={costoMercaderiaVendida}
        />
        <InventarioTab metrics={metrics} />
        <BajasTab
          metrics={metrics}
          bajasDelPeriodo={bajasDelPeriodo}
          productos={productos}
        />

        {/* 🚀 Pasamos los parámetros dinámicos al Tab del CRM */}
        <CrmTab
          ventas={ventas}
          ventasDelPeriodo={ventasDelPeriodo}
          clientes={clientes}
          plazoMora={plazoMora}
          diasInactivo={diasInactivo}
        />

        <VendedoresTab
          puedeVer={puedeVerVendedores}
          desde={desdeVendedores}
          hasta={hastaVendedores}
        />

        {/* Tiene su propio selector de período: el contador cierra por mes,
            no por el filtro con el que se miran los reportes del día. */}
        <TabsContent value="exportaciones" className="mt-0">
          <ExportacionesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
