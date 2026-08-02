import {
  getVentasAction,
  getPagosCuentaCorrienteAction,
} from "@/features/sales/actions/get-sales";
import { getStockAction } from "@/features/stock/actions/get-product";
import { CrearProductoSheet } from "@/features/stock/ui/create-sheet";
import { EgresoModal } from "@/features/caja/ui/egreso-modal";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { getDashboardMetrics } from "@/features/dashboard/lib/get-dashboard-metrics";
import {
  resolverRangoActual,
  resolverRangoAnterior,
  resolverRangoRanking,
  formatearFechaISO,
  calcularCrecimiento,
  type PeriodoPanel,
} from "@/features/dashboard/lib/periodo-ranges";
import { construirSerieDiaria } from "@/features/dashboard/lib/build-chart-series";
import {
  detectarQuiebresRotacion,
  VENTANA_ROTACION_DIAS,
} from "@/features/dashboard/lib/detectar-quiebres";
import { detectarCategoriasEnRiesgo } from "@/features/dashboard/lib/detectar-riesgo-categoria";
import {
  detectarFinDeTemporada,
  detectarProximaTemporada,
} from "@/features/dashboard/lib/detectar-estacionalidad";
import { resolverCategoriaDisplayLabel } from "@/shared/utils/category-tree";
import { PanelPeriodoSelector } from "@/features/dashboard/ui/panel-periodo-selector";
import { IngresosAreaChart } from "@/features/dashboard/ui/ingresos-area-chart";
import { KpiMiniCard } from "@/features/dashboard/ui/kpi-mini-card";
import { GrowthBadge } from "@/features/dashboard/ui/growth-badge";
import { AdvisorMiniList } from "@/features/dashboard/ui/advisor-mini-list";
import { AtencionRequeridaCard } from "@/features/dashboard/ui/atencion-requerida-card";
import { RendimientoCard } from "@/features/dashboard/ui/rendimiento-card";
import { getAdvisorInsights } from "@/features/reports/actions/get-advisor-insights";
import { getDeudaVencidaAction } from "@/features/clients/actions/get-deuda-vencida";
import { getRemitosPendientesAction } from "@/features/purchases/actions/get-remitos-pendientes";
import { listarReservasActivasAction } from "@/features/reservations/actions/manage-reservations";
import {
  getSupabaseRelation,
  SupabaseRelation,
  Venta,
  VentaPago,
} from "@/entities/ventas/types";
import Link from "next/link";
import { Receipt, Plus } from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";

export const dynamic = "force-dynamic";

const PERIODOS_VALIDOS: PeriodoPanel[] = ["hoy", "semana", "mes"];

function parsearPeriodo(valor: string | undefined): PeriodoPanel {
  return PERIODOS_VALIDOS.includes(valor as PeriodoPanel)
    ? (valor as PeriodoPanel)
    : "semana";
}

const ETIQUETA_PERIODO: Record<PeriodoPanel, string> = {
  hoy: "hoy",
  semana: "esta semana",
  mes: "este mes",
};

// Los rankings nunca son diarios (una ventana de un solo día es mala
// muestra para "qué rota más") — con Hoy o Semana usan ventana semanal, con
// Mes usan ventana de mes. Ver resolverRangoRanking.
const ETIQUETA_RANKING: Record<PeriodoPanel, string> = {
  hoy: "esta semana",
  semana: "esta semana",
  mes: "este mes",
};

type ReservaActivaRow = {
  id: string;
  creado_en: string;
  producto: SupabaseRelation<{ nombre: string }>;
  variante: SupabaseRelation<{ nombre_display: string }>;
  cliente: SupabaseRelation<{ nombre: string }>;
  vendedora: SupabaseRelation<{ nombre: string }>;
};

export default async function DashboardPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ periodo?: string }>;
}>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { periodo: periodoParam } = await searchParams;
  const periodo = parsearPeriodo(periodoParam);

  const [
    ventasResponse,
    productosResponse,
    egresosResponse,
    bajasResponse,
    reservasResponse,
    deudaVencida,
    remitosPendientes,
    categoriasResponse,
    pagosCuentaCorrienteResponse,
  ] = await Promise.all([
    getVentasAction(),
    getStockAction(),
    supabase.from("egresos").select("id, concepto, monto, fecha"),
    supabase
      .from("bajas")
      .select("id, producto_id, cantidad, creado_en, estado"),
    listarReservasActivasAction(),
    getDeudaVencidaAction(),
    getRemitosPendientesAction(),
    supabase.from("categorias").select("id, nombre, slug, parent_id"),
    getPagosCuentaCorrienteAction(),
  ]);

  const ventas = (ventasResponse.data || []) as unknown as Venta[];
  // Cobros de deuda: aportan comisión y recargo a las métricas, no ingresos.
  const pagosCuentaCorriente = (pagosCuentaCorrienteResponse.data ||
    []) as unknown as VentaPago[];
  const ventasOperativas = ventas.filter(
    (venta) =>
      venta.estado_operacion !== "ANULADA" && venta.estado_pago !== "ANULADA",
  );
  const productos = productosResponse.data || [];
  const egresos = egresosResponse.data || [];
  const bajas = bajasResponse.data || [];

  const bajasAprobadas = bajas.filter((b) => b.estado === "APROBADA");
  const cantidadBajasPendientes = bajas.filter(
    (b) => b.estado === "PENDIENTE",
  ).length;

  const hoy = new Date();

  // Zona analítica (KPIs + chart + rankings): TODO lo de acá para abajo
  // depende de `periodo`. La zona de excepciones (Atención Requerida,
  // Comerz Insights) es fija y vive fuera de este bloque.
  const rangoActual = resolverRangoActual(periodo, hoy);
  const rangoAnterior = resolverRangoAnterior(periodo, hoy);
  const rangoRanking = resolverRangoRanking(periodo, hoy);

  const metricasActuales = getDashboardMetrics(
    ventasOperativas,
    productos,
    egresos,
    bajasAprobadas,
    "personalizado",
    formatearFechaISO(rangoActual.inicio),
    formatearFechaISO(rangoActual.fin),
    pagosCuentaCorriente,
  );
  const metricasAnteriores = getDashboardMetrics(
    ventasOperativas,
    productos,
    egresos,
    bajasAprobadas,
    "personalizado",
    formatearFechaISO(rangoAnterior.inicio),
    formatearFechaISO(rangoAnterior.fin),
    pagosCuentaCorriente,
  );
  // Rankings: SIEMPRE ventana semanal como mínimo (nunca diaria) — ventana
  // de mes si el selector está en "Mes".
  const metricasRanking = getDashboardMetrics(
    ventasOperativas,
    productos,
    egresos,
    bajasAprobadas,
    "personalizado",
    formatearFechaISO(rangoRanking.inicio),
    formatearFechaISO(rangoRanking.fin),
  );

  const crecimientoIngresos = calcularCrecimiento(
    metricasActuales.ingresos,
    metricasAnteriores.ingresos,
  );
  const crecimientoUnidades = calcularCrecimiento(
    metricasActuales.unidadesVendidas,
    metricasAnteriores.unidadesVendidas,
  );
  const crecimientoGanancia = calcularCrecimiento(
    metricasActuales.gananciaBrutaVentas,
    metricasAnteriores.gananciaBrutaVentas,
  );

  const serieChart = construirSerieDiaria(ventasOperativas, 30, hoy);

  const quiebres = detectarQuiebresRotacion(
    ventasOperativas,
    productos,
    VENTANA_ROTACION_DIAS,
    hoy,
  );

  const categoriasFlat = categoriasResponse.data || [];
  const categoriasEnRiesgo = detectarCategoriasEnRiesgo(
    ventasOperativas,
    productos,
    VENTANA_ROTACION_DIAS,
    hoy,
  );
  const categoriaEnRiesgo = categoriasEnRiesgo[0];
  const categoriaEnRiesgoLabel = categoriaEnRiesgo
    ? resolverCategoriaDisplayLabel(categoriasFlat, categoriaEnRiesgo.categoriaId)
    : "";

  const finDeTemporada = detectarFinDeTemporada(
    ventasOperativas,
    productos,
    categoriasFlat,
    metricasActuales.stockValorizadoCosto,
    VENTANA_ROTACION_DIAS,
    hoy,
  );
  const proximaTemporada = detectarProximaTemporada(productos, categoriasFlat, hoy);

  // Advisor: mismo motor de siempre (getAdvisorInsights, sin tocar su
  // lógica de orden/corte), extendido con las reglas nuevas — se activan
  // solo si el fetch correspondiente trajo datos.
  const insights = getAdvisorInsights({
    ...metricasActuales,
    deudaVencida: deudaVencida ?? undefined,
    remitosPendientes:
      remitosPendientes && remitosPendientes.cantidad > 0
        ? remitosPendientes
        : undefined,
    categoriaEnRiesgo:
      categoriaEnRiesgo && categoriaEnRiesgoLabel
        ? {
            categoria: categoriaEnRiesgoLabel,
            unidadesVendidas: categoriaEnRiesgo.unidadesVendidas,
            diasCobertura: categoriaEnRiesgo.diasCobertura,
          }
        : undefined,
    finDeTemporada: finDeTemporada ?? undefined,
    proximaTemporada: proximaTemporada ?? undefined,
  });

  const ventasDeHoy = ventasOperativas.filter((v) => {
    const f = new Date(v.fecha_venta);
    return (
      f.getDate() === hoy.getDate() &&
      f.getMonth() === hoy.getMonth() &&
      f.getFullYear() === hoy.getFullYear()
    );
  });
  const ultimasVentas = ventasDeHoy.slice(0, 4);

  const reservasActivasRaw = (reservasResponse.data ||
    []) as unknown as ReservaActivaRow[];
  const reservasActivas = reservasActivasRaw.map((r) => {
    const producto = getSupabaseRelation(r.producto);
    const variante = getSupabaseRelation(r.variante);
    const cliente = getSupabaseRelation(r.cliente);
    const vendedora = getSupabaseRelation(r.vendedora);
    const horasActiva =
      (hoy.getTime() - new Date(r.creado_en).getTime()) / (1000 * 3600);

    return {
      id: r.id,
      creadoEn: r.creado_en,
      nombreProducto: producto?.nombre || "Producto eliminado",
      varianteNombre: variante?.nombre_display || null,
      clienteNombre: cliente?.nombre || null,
      vendedoraNombre: vendedora?.nombre || null,
      vencida: horasActiva >= 24,
    };
  });

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Aplicar de forma global a los contenedores scroll */
            ::-webkit-scrollbar {
              width: 6px !important;
              height: 6px !important;
            }
            ::-webkit-scrollbar-track {
              background: transparent !important;
            }
            ::-webkit-scrollbar-thumb {
              background: rgba(156, 163, 175, 0.25) !important; /* Gris sutil traslúcido */
              border-radius: 9999px !important;
              transition: background 0.2s ease !important;
            }
            ::-webkit-scrollbar-thumb:hover {
              background: rgba(156, 163, 175, 0.45) !important; /* Un poco más oscuro al pasar el mouse */
            }
            /* Compatibilidad con Firefox */
            * {
              scrollbar-width: thin !important;
              scrollbar-color: rgba(156, 163, 175, 0.25) transparent !important;
            }
          `,
        }}
      />

      <div className="flex flex-col gap-3 px-2 py-2">
        {/* HEADER UNIFICADO — título + acciones + selector de período, una sola barra */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <h1 className="text-sm font-medium text-foreground">
              Operación de hoy
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Intl.DateTimeFormat("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(hoy)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={"/pos"}
              className="h-10 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 sm:w-auto bg-primary text-white py-2 [a]:hover:bg-primary/80 cursor-pointer inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <Plus className="mr-2 h-4 w-4" /> Registrar Venta
            </Link>
            <div className="hidden md:flex">
              <CrearProductoSheet />
            </div>
            <EgresoModal />
            <PanelPeriodoSelector periodo={periodo} />
          </div>
        </div>

        {/* FILA 1 — 40% KPIs / 60% chart, ambas dependen del selector de período */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
          <div className="lg:col-span-2 grid grid-cols-2 gap-3">
            <KpiMiniCard
              label="Ingresos"
              value={formatearMoneda(metricasActuales.ingresos)}
              sublabel={ETIQUETA_PERIODO[periodo]}
              rightSlot={<GrowthBadge value={crecimientoIngresos} />}
            />
            <KpiMiniCard
              label="Unidades"
              value={String(metricasActuales.unidadesVendidas)}
              sublabel="vendidas"
              rightSlot={<GrowthBadge value={crecimientoUnidades} />}
            />
            <KpiMiniCard
              label="Ticket promedio"
              value={formatearMoneda(metricasActuales.ticketPromedio)}
              sublabel={`${metricasActuales.ordenes} tickets`}
              rightSlot={
                <Receipt className="w-3.5 h-3.5 text-muted-foreground/40" />
              }
            />
            <KpiMiniCard
              label="Ganancia"
              value={formatearMoneda(metricasActuales.gananciaBrutaVentas)}
              sublabel={`Margen ${metricasActuales.margenPorcentaje.toFixed(1)}%`}
              rightSlot={<GrowthBadge value={crecimientoGanancia} />}
            />
          </div>

          <div className="lg:col-span-3">
            <IngresosAreaChart serie={serieChart} />
          </div>
        </div>

        {/* FILA 2 — 3 columnas iguales, cada una con tabs internas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:h-[300px]">
          <AdvisorMiniList insights={insights} />

          <AtencionRequeridaCard
            quiebres={quiebres}
            stockCritico={metricasActuales.stockCriticoDetallado}
            cantidadBajasPendientes={cantidadBajasPendientes}
            reservasActivas={reservasActivas}
          />

          <RendimientoCard
            topProductos={metricasRanking.topProductos}
            topProductosRentables={metricasRanking.topProductosRentables}
            etiquetaRanking={ETIQUETA_RANKING[periodo]}
            ultimasVentas={ultimasVentas}
          />
        </div>
      </div>
    </>
  );
}
