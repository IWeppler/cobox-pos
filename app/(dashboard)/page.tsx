import { getVentasAction } from "@/features/sales/actions/get-sales";
import { getStockAction } from "@/features/stock/actions/get-product";
import { CrearProductoSheet } from "@/features/stock/ui/create-sheet";
import { EgresoModal } from "@/features/caja/ui/egreso-modal";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { getDashboardMetrics } from "@/features/dashboard/lib/get-dashboard-metrics";
import { listarReservasActivasAction } from "@/features/reservations/actions/manage-reservations";
import {
  getSupabaseRelation,
  SupabaseRelation,
  Venta,
} from "@/entities/ventas/types";
import Link from "next/link";
import {
  Receipt,
  ShoppingBag,
  Wallet,
  Flame,
  Trophy,
  Package,
  Bookmark,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
} from "lucide-react";
import {
  formatearMoneda,
  formatearHora,
  formatearFechaHora,
} from "@/shared/utils/formatters";
import { Button } from "@/shared/ui/button";

export const dynamic = "force-dynamic";

type ReservaActivaRow = {
  id: string;
  creado_en: string;
  producto: SupabaseRelation<{ nombre: string }>;
  variante: SupabaseRelation<{ nombre_display: string }>;
  cliente: SupabaseRelation<{ nombre: string }>;
  vendedora: SupabaseRelation<{ nombre: string }>;
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    ventasResponse,
    productosResponse,
    egresosResponse,
    bajasResponse,
    turnoResponse,
    reservasResponse,
  ] = await Promise.all([
    getVentasAction(),
    getStockAction(),
    supabase.from("egresos").select("id, concepto, monto, fecha"),
    supabase
      .from("bajas")
      .select("id, producto_id, cantidad, creado_en, estado"),
    supabase
      .from("turnos_caja")
      .select("*")
      .eq("estado", "ABIERTO")
      .order("fecha_apertura", { ascending: false })
      .limit(1)
      .single(),
    listarReservasActivasAction(),
  ]);

  const ventas = (ventasResponse.data || []) as unknown as Venta[];
  const ventasOperativas = ventas.filter(
    (venta) =>
      venta.estado_operacion !== "ANULADA" && venta.estado_pago !== "ANULADA",
  );
  const productos = productosResponse.data || [];
  const egresos = egresosResponse.data || [];
  const bajas = bajasResponse.data || [];
  const turnoAbierto = turnoResponse.data || null;

  const bajasAprobadas = bajas.filter((b) => b.estado === "APROBADA");
  const cantidadBajasPendientes = bajas.filter(
    (b) => b.estado === "PENDIENTE",
  ).length;

  const metricasHoy = getDashboardMetrics(
    ventasOperativas,
    productos,
    egresos,
    bajasAprobadas,
    "hoy",
  );

  const hoy = new Date();
  const { inicio: inicioAyer, fin: finAyer } = getPreviousDayRange(hoy);

  const ventasAyer = ventasOperativas.filter((v) => {
    const fechaVenta = new Date(v.fecha_venta);
    return fechaVenta >= inicioAyer && fechaVenta <= finAyer;
  });

  const ingresosAyer = ventasAyer.reduce((acc, v) => acc + Number(v.total), 0);
  const unidadesAyer = ventasAyer.reduce(
    (acc, v) => acc + Number(v.cantidad),
    0,
  );

  const crecimientoIngresos = calcularCrecimientoDiario(
    metricasHoy.ingresos,
    ingresosAyer,
  );
  const crecimientoUnidades = calcularCrecimientoDiario(
    metricasHoy.unidadesVendidas,
    unidadesAyer,
  );

  const ventasDeHoy = ventasOperativas.filter((v) => {
    const f = new Date(v.fecha_venta);
    return (
      f.getDate() === hoy.getDate() &&
      f.getMonth() === hoy.getMonth() &&
      f.getFullYear() === hoy.getFullYear()
    );
  });
  const ultimasVentas = ventasDeHoy.slice(0, 4);

  let efectivoEsperado = 0;
  let egresosTurno = 0;
  if (turnoAbierto) {
    const ventasTurnoEfectivo = ventasOperativas.filter(
      (v) =>
        new Date(v.fecha_venta) >= new Date(turnoAbierto.fecha_apertura) &&
        v.metodo_pago === "EFECTIVO",
    );
    const egresosTurnoEfectivo = egresos.filter(
      (e) => new Date(e.fecha) >= new Date(turnoAbierto.fecha_apertura),
    );
    const ingresosTurnoEf = ventasTurnoEfectivo.reduce(
      (acc, v) => acc + Number(v.total),
      0,
    );
    egresosTurno = egresosTurnoEfectivo.reduce(
      (acc, e) => acc + Number(e.monto),
      0,
    );
    efectivoEsperado =
      Number(turnoAbierto.monto_inicial) + ingresosTurnoEf - egresosTurno;
  }

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

      <div className="space-y-6 px-2 py-2">
        {/* HEADER */}
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
          <div className="flex flex-wrap items-center gap-4 md:gap-2">
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
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
          {/* Ingresos brutos */}
          <div className="bg-card border border-border rounded-xl p-4 flex min-w-[82vw] flex-col gap-3 snap-start sm:min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ingresos brutos
              </span>
              <GrowthBadge value={crecimientoIngresos} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {formatearMoneda(metricasHoy.ingresos)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ganancia est.: {formatearMoneda(metricasHoy.gananciaNeta)}
              </p>
            </div>
          </div>

          {/* Unidades vendidas */}
          <div className="bg-card border border-border rounded-xl p-4 flex min-w-[82vw] flex-col gap-3 snap-start sm:min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Unidades vendidas
              </span>
              <GrowthBadge value={crecimientoUnidades} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {metricasHoy.unidadesVendidas}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Artículos entregados hoy
              </p>
            </div>
          </div>

          {/* Tickets emitidos */}
          <div className="bg-card border border-border rounded-xl p-4 flex min-w-[82vw] flex-col gap-3 snap-start sm:min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tickets emitidos
              </span>
              <Receipt className="w-3.5 h-3.5 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {metricasHoy.ordenes}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ticket promedio: {formatearMoneda(metricasHoy.ticketPromedio)}
              </p>
            </div>
          </div>

          {/* Ganancia estimada */}
          <div className="bg-card border border-border rounded-xl p-4 flex min-w-[82vw] flex-col gap-3 snap-start sm:min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ganancia estimada
              </span>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {formatearMoneda(metricasHoy.gananciaBrutaVentas)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Margen: {metricasHoy.margenPorcentaje.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* BLOQUES OPERATIVOS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Caja actual */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Caja actual
              </span>
            </div>
            {turnoAbierto ? (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Abierta desde {formatearHora(turnoAbierto.fecha_apertura)}
                  </p>
                  <p className="text-lg font-medium text-foreground">
                    {formatearMoneda(efectivoEsperado)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Egresos del turno:{" "}
                    <span className="text-destructive font-medium">
                      {formatearMoneda(egresosTurno)}
                    </span>
                  </p>
                </div>
                <Link href="/caja">
                  <Button variant="outline" className="w-full">
                    Ver caja
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <div className="flex-1 flex items-center justify-center py-4">
                  <p className="text-xs text-muted-foreground">
                    La caja está cerrada
                  </p>
                </div>
                <Link href="/caja">
                  <Button variant="outline" className="w-full">
                    Abrir turno
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Alertas de stock */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Alertas de stock
              </span>
            </div>
            <div className="flex-1 space-y-2">
              {metricasHoy.productosCriticos > 0 ? (
                <div className="flex items-center gap-2 text-xs bg-muted/40 border border-border rounded-lg px-3 py-2 text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {metricasHoy.productosCriticos} productos con stock bajo (≤ 3)
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic pt-1">
                  Inventario saludable.
                </p>
              )}
              {cantidadBajasPendientes > 0 && (
                <div className="flex items-center gap-2 text-xs bg-muted/40 border border-border rounded-lg px-3 py-2 text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
                  {cantidadBajasPendientes} mermas pendientes de revisión
                </div>
              )}
            </div>
            <Link href="/stock">
              <Button variant="outline" className="w-full">
                Ir al inventario
              </Button>
            </Link>
          </div>

          {/* Reservas activas */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Reservas activas
              </span>
            </div>
            <div className="flex-1">
              {reservasActivas.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {reservasActivas.length} producto
                    {reservasActivas.length === 1 ? "" : "s"} en reservas
                    activas
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {reservasActivas.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-1.5 border ${
                          r.vencida
                            ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"
                            : "bg-muted/40 border-border"
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className="font-medium text-foreground truncate"
                            title={r.nombreProducto}
                          >
                            {r.nombreProducto}
                            {r.varianteNombre ? ` · ${r.varianteNombre}` : ""}
                          </p>
                          <p className="text-muted-foreground truncate">
                            desde {formatearFechaHora(r.creadoEn)}
                            {r.vendedoraNombre
                              ? ` · ${r.vendedoraNombre}`
                              : ""}
                            {r.clienteNombre
                              ? ` · para ${r.clienteNombre}`
                              : ""}
                          </p>
                        </div>
                        {r.vencida && (
                          <span className="shrink-0 text-amber-700 dark:text-amber-400 font-medium">
                            +24h
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center">
                  <p className="text-xs text-muted-foreground italic">
                    Sin reservas activas.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RANKINGS Y FEED */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Mayor rotación */}
          <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Flame className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mayor rotación hoy
              </span>
            </div>
            {metricasHoy.topProductos.length > 0 ? (
              <div className="divide-y divide-border">
                {metricasHoy.topProductos.slice(0, 4).map((producto, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-xs text-muted-foreground/50 w-4 shrink-0">
                        {idx + 1}
                      </span>
                      <p
                        className="text-sm font-medium text-foreground truncate"
                        title={producto.nombre}
                      >
                        {producto.nombre}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground ml-3 shrink-0 bg-muted/50 border border-border rounded px-2 py-0.5">
                      {producto.unidades} u.
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Sin ventas registradas.
              </div>
            )}
          </div>

          {/* Mayor rentabilidad */}
          <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mayor rentabilidad hoy
              </span>
            </div>
            {metricasHoy.topProductosRentables.length > 0 ? (
              <div className="divide-y divide-border">
                {metricasHoy.topProductosRentables
                  .slice(0, 4)
                  .map((producto, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="text-xs text-muted-foreground/50 w-4 shrink-0">
                          {idx + 1}
                        </span>
                        <p
                          className="text-sm font-medium text-foreground truncate"
                          title={producto.nombre}
                        >
                          {producto.nombre}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-foreground ml-3 shrink-0">
                        +{formatearMoneda(producto.ganancia)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Sin ventas registradas.
              </div>
            )}
          </div>

          {/* Últimas ventas */}
          <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Últimas ventas
                </span>
              </div>
              <Link
                href="/ventas"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todas →
              </Link>
            </div>
            {ultimasVentas.length > 0 ? (
              <div className="divide-y divide-border">
                {ultimasVentas.map((venta) => (
                  <div
                    key={venta.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight line-clamp-1">
                        {getSupabaseRelation(venta.ventas_items?.[0]?.producto)
                          ?.nombre || "Producto eliminado"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatearHora(venta.fecha_venta)} · {venta.cantidad} u.
                      </p>
                    </div>
                    <p className="text-sm font-medium text-foreground ml-4 shrink-0">
                      {formatearMoneda(venta.total)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Sin ventas recientes.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function getPreviousDayRange(date: Date) {
  const inicio = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - 1,
    0,
    0,
    0,
    0,
  );
  const fin = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - 1,
    23,
    59,
    59,
    999,
  );

  return { inicio, fin };
}

function calcularCrecimientoDiario(valorHoy: number, valorAyer: number) {
  if (valorHoy <= 0 || valorAyer <= 0) return 0;
  return ((valorHoy - valorAyer) / valorAyer) * 100;
}

// Componente auxiliar para badge de crecimiento
function GrowthBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
        isPositive
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {isPositive ? "+" : ""}
      {value.toFixed(0)}%
    </span>
  );
}
