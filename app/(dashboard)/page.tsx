import {
  getVentasAction,
  getPagosCuentaCorrienteAction,
} from "@/features/sales/actions/get-sales";
import { getStockAction } from "@/features/stock/actions/get-product";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { getDashboardMetrics } from "@/features/dashboard/lib/get-dashboard-metrics";
import {
  resolverRangoActual,
  resolverRangoAnterior,
  resolverRangoRanking,
  formatearFechaISO,
  calcularCrecimiento,
  ETIQUETA_PERIODO_ANTERIOR,
  type PeriodoPanel,
} from "@/shared/lib/periodo-ranges";
import {
  construirSerieComparada,
  granularidadPara,
} from "@/features/dashboard/lib/build-chart-series";
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
import { PeriodoSelector } from "@/shared/components/periodo-selector";
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
import { formatearMoneda } from "@/shared/utils/formatters";
import { EgresoModal } from "@/features/caja/ui/egreso-modal";
import { getEstadoActivacionAction } from "@/features/onboarding/actions/get-estado-activacion";
import { ChecklistActivacion } from "@/features/onboarding/ui/checklist-activacion";
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { bloquearVendedor } from "@/shared/config/supabase/guard-rol";

export const dynamic = "force-dynamic";

const PERIODOS_VALIDOS: PeriodoPanel[] = ["hoy", "semana", "mes", "anio"];

function parsearPeriodo(valor: string | undefined): PeriodoPanel {
  return PERIODOS_VALIDOS.includes(valor as PeriodoPanel)
    ? (valor as PeriodoPanel)
    : "semana";
}

const ETIQUETA_PERIODO: Record<PeriodoPanel, string> = {
  hoy: "hoy",
  semana: "esta semana",
  mes: "este mes",
  anio: "este año",
};

// Los rankings nunca son diarios (una ventana de un solo día es mala
// muestra para "qué rota más") — con Hoy o Semana usan ventana semanal, con
// Mes usan ventana de mes. Ver resolverRangoRanking.
const ETIQUETA_RANKING: Record<PeriodoPanel, string> = {
  hoy: "esta semana",
  semana: "esta semana",
  mes: "este mes",
  anio: "este año",
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
  // El panel es la vista de gestión: un VENDEDOR va al POS. Hasta ahora eso
  // lo decidía solo el middleware. Ver `bloquearVendedor`.
  await bloquearVendedor();

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
    estadoActivacion,
  ] = await Promise.all([
    getVentasAction(),
    getStockAction(),
    supabase.from("egresos").select("id, concepto, monto, fecha, tipo, orden_compra_id"),
    supabase
      .from("bajas")
      .select("id, producto_id, cantidad, creado_en, estado"),
    listarReservasActivasAction(),
    getDeudaVencidaAction(),
    getRemitosPendientesAction(),
    supabase.from("categorias").select("id, nombre, slug, parent_id"),
    getPagosCuentaCorrienteAction(),
    // Devuelve null si no es ADMIN: el gate vive en la RPC, así que acá no hay
    // que preguntar el rol por separado.
    getEstadoActivacionAction(),
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
  const crecimientoTicket = calcularCrecimiento(
    metricasActuales.ticketPromedio,
    metricasAnteriores.ticketPromedio,
  );

  // El chart usa EXACTAMENTE los rangos del selector general (no una ventana
  // fija de 30 días) — el selector 7D/30D propio del chart ya no existe.
  const serieChart = construirSerieComparada(
    ventasOperativas,
    rangoActual,
    rangoAnterior,
    granularidadPara(periodo),
    hoy,
  );
  const etiquetaAnterior = ETIQUETA_PERIODO_ANTERIOR[periodo];
  const tituloComparacion = `vs. ${etiquetaAnterior}`;

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
        {/* HEADER — título + selector de período, nada más. Las acciones se
            fueron a donde vive cada una: vender y crear producto ya están en
            el menú y en la toolbar de /stock, y el gasto pasó al modal de
            caja del navbar (es plata que sale del cajón). */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-foreground">
              Operación de hoy
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {new Intl.DateTimeFormat("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(hoy)}
            </p>
          </div>
          <PeriodoSelector periodo={periodo} ariaLabel="Período del panel" />
        </div>

        {/* GUÍA DE INICIO — arriba de todo mientras falte algo para vender, y
            se va sola cuando está completa (el estado es derivado, no un flag).
            Solo ADMIN: la RPC devuelve null para el resto. */}
        {estadoActivacion && <ChecklistActivacion estado={estadoActivacion} />}

        {/* ACCIONES — solo mobile: en desktop el POS está siempre a la vista en
            el sidebar, acá el menú está detrás de la hamburguesa y vender
            quedaba a dos toques. El gasto va al lado porque a este panel solo
            entra quien tiene permiso, y ese permiso implica poder anotarlo
            (sigue estando también en el modal de caja del navbar). */}
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <Button asChild className="h-11 w-full">
            <Link href="/pos">
              <Plus className="mr-2 h-4 w-4" />
              Vender
            </Link>
          </Button>
          <EgresoModal
            triggerVariant="outline"
            triggerClassName="h-11 w-full"
          />
        </div>

        {/* FILA 1 — 40% KPIs / 60% chart, ambas dependen del selector de período */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
          <div className="lg:col-span-2 grid grid-cols-2 gap-2">
            <KpiMiniCard
              label="Ingresos"
              value={formatearMoneda(metricasActuales.ingresos)}
              sublabel={`${ETIQUETA_PERIODO[periodo]} · ${tituloComparacion}`}
              rightSlot={
                <GrowthBadge
                  value={crecimientoIngresos}
                  titulo={tituloComparacion}
                />
              }
            />
            <KpiMiniCard
              label="Unidades"
              value={String(metricasActuales.unidadesVendidas)}
              sublabel={`vendidas · ${tituloComparacion}`}
              rightSlot={
                <GrowthBadge
                  value={crecimientoUnidades}
                  titulo={tituloComparacion}
                />
              }
            />
            <KpiMiniCard
              label="Ticket promedio"
              value={formatearMoneda(metricasActuales.ticketPromedio)}
              sublabel={`${metricasActuales.ordenes} tickets`}
              rightSlot={
                <GrowthBadge
                  value={crecimientoTicket}
                  titulo={tituloComparacion}
                />
              }
            />
            <KpiMiniCard
              label="Ganancia"
              value={formatearMoneda(metricasActuales.gananciaBrutaVentas)}
              sublabel={`Margen ${metricasActuales.margenPorcentaje.toFixed(1)}%`}
              rightSlot={
                <GrowthBadge
                  value={crecimientoGanancia}
                  titulo={tituloComparacion}
                />
              }
            />
          </div>

          <div className="lg:col-span-3">
            <IngresosAreaChart
              serie={serieChart}
              etiquetaPeriodo={ETIQUETA_PERIODO[periodo]}
              etiquetaPeriodoAnterior={etiquetaAnterior}
            />
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
