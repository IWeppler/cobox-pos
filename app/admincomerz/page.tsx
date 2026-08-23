import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { getPanelComerzAction } from "@/features/admin/actions/metricas-comerz";
import { getComerciosConUsoAction } from "@/features/admin/actions/comercios-con-uso";
import { getFeedComerzAction } from "@/features/admin/actions/feed-comerz";
import { getPlanesCompletosAction } from "@/features/admin/actions/planes-actions";
import {
  construirSerieMrr,
  variacionMensual,
} from "@/features/admin/lib/serie-mrr";
import { MrrChart } from "@/features/admin/ui/mrr-chart";
import { ComerciosTabla } from "@/features/admin/ui/comercios-tabla";
import { NotificacionesTabla } from "@/features/admin/ui/notificaciones-tabla";
import { formatearMoneda } from "@/shared/utils/formatters";
import { getGastosAction } from "@/features/admin/actions/gastos-comerz";
import { AnotarGastoBoton } from "@/features/admin/ui/anotar-gasto-boton";
import { GastosDelMes } from "@/features/admin/ui/gastos-del-mes";
import { getFunnelAction } from "@/features/admin/actions/funnel-comerz";
import { analizarFunnel, enRiesgo, resumirFunnel } from "@/features/admin/lib/funnel";
import { FunnelPanel } from "@/features/admin/ui/funnel-panel";
import {
  gastoAplicaEnMes,
  gastosPorMes,
} from "@/features/admin/lib/gastos-por-mes";
import {
  calcularArpu,
  calcularChurnMensual,
  calcularLtv,
  resumirCostos,
} from "@/features/admin/lib/metricas-saas";
import { MetricasSaasPanel } from "@/features/admin/ui/metricas-saas-panel";

// export const dynamic = "force-dynamic";

export const metadata = { title: "Panel Comerz" };

export default async function AdminComerzPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    { negocios, metricas },
    comercios,
    feed,
    planes,
    { data: pagos },
    gastos,
    filasFunnel,
  ] = await Promise.all([
    getPanelComerzAction(),
    getComerciosConUsoAction(),
    getFeedComerzAction(),
    getPlanesCompletosAction(),
    supabase
      .from("pagos_suscripcion")
      .select("monto, fecha_pago")
      .order("fecha_pago", { ascending: true }),
    getGastosAction(),
    getFunnelAction(),
  ]);

  const serieCobrado = construirSerieMrr(
    (pagos ?? []).map((p) => ({
      monto: Number(p.monto ?? 0),
      fecha_pago: p.fecha_pago as string,
    })),
    new Date(),
  );

  // Los gastos se pegan a la misma serie para que el gráfico los dibuje al
  // lado de lo cobrado. Un FIJO no tiene una fila por mes —tiene una que
  // aplica a un rango— así que cuánto pesa en cada mes es una cuenta, y vive
  // en `gastos-por-mes.ts` con tests.
  const totalesGasto = gastosPorMes(
    gastos,
    serieCobrado.map((p) => p.mes),
  );
  const serie = serieCobrado.map((punto, i) => ({
    ...punto,
    gastos: totalesGasto[i],
  }));

  const cobradoEsteMes = serie[serie.length - 1]?.total ?? 0;
  const variacion = variacionMensual(serieCobrado);

  const comerciosFunnel = analizarFunnel(filasFunnel);
  const resumenFunnel = resumirFunnel(comerciosFunnel);
  const comerciosEnRiesgo = enRiesgo(comerciosFunnel);

  // Los del mes en curso, con la MISMA regla que usa el gráfico. Repetirla
  // acá a mano sería tener dos definiciones de "gasto de este mes" y que un
  // día digan cosas distintas.
  const mesActual = serie[serie.length - 1]?.mes ?? "";
  const gastosDelMes = gastos.filter((g) => gastoAplicaEnMes(g, mesActual));

  // ARPU, churn y LTV se calculan sobre lo COBRADO y sobre las bajas reales.
  // Cada uno devuelve null cuando la muestra no alcanza, y el panel muestra el
  // motivo en vez del número: ver metricas-saas.ts.
  const ahora = new Date();
  const arpu = calcularArpu(cobradoEsteMes, metricas.activos);
  const churn = calcularChurnMensual(
    negocios.map((n) => ({
      estado: n.estado,
      created_at: n.created_at,
      estado_cambiado_en: n.estado_cambiado_en,
    })),
    ahora,
  );
  const ltv = calcularLtv(arpu, churn);
  const costos = resumirCostos(
    gastosDelMes.map((g) => ({ concepto: g.concepto, monto: g.monto })),
    cobradoEsteMes,
    metricas.activos,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Panel Comerz
          </h1>
          <p className="text-sm text-white/40">Cómo viene el negocio.</p>
        </div>
        {/* A la altura del título y no adentro del panel de métricas: anotar un
            gasto es una acción, y las métricas son para leer. */}
        <AnotarGastoBoton />
      </div>

     
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr] xl:items-stretch">
       
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">
              Cobrado este mes
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
              {formatearMoneda(cobradoEsteMes)}
            </p>
            {variacion !== null && (
              <p
                className={`mt-1 text-xs font-medium ${
                  variacion >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {variacion >= 0 ? "▲" : "▼"} {Math.abs(variacion).toFixed(0)}%
                vs. el mes pasado
              </p>
            )}
          </div>

          <div className="flex gap-6">
            <Dato
              titulo="MRR teórico"
              valor={formatearMoneda(metricas.mrr)}
              detalle="si todos pagaran"
            />
            <Dato
              titulo="Activos"
              valor={String(metricas.activos)}
              detalle={
                metricas.suspendidos > 0
                  ? `${metricas.suspendidos} suspendidos`
                  : "ninguno suspendido"
              }
            />
            <Dato
              titulo="En prueba"
              valor={String(metricas.enPrueba)}
              detalle="dentro de sus 14 días"
            />
          </div>
        </div>

        <MrrChart serie={serie} />
      </div>

        <NotificacionesTabla notificaciones={feed} />
      </div>

      <MetricasSaasPanel
        arpu={arpu}
        churn={churn}
        ltv={ltv}
        costos={costos}
      />

      <GastosDelMes
        gastos={gastosDelMes}
        total={costos.total}
        porComercio={costos.porComercio}
      />

      <FunnelPanel resumen={resumenFunnel} riesgo={comerciosEnRiesgo} />

      {/* Comercios pasa a ancho completo: con las notificaciones arriba, la
          tabla ya no comparte fila y sus 7 columnas dejan de ir apretadas. */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white/90">Comercios</h2>
        <ComerciosTabla
          comercios={comercios}
          planes={planes.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            precio_mensual: p.precio_mensual,
          }))}
        />
      </div>
    </div>
  );
}

function Dato({
  titulo,
  valor,
  detalle,
}: Readonly<{ titulo: string; valor: string; detalle: string }>) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">
        {titulo}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-white/90">{valor}</p>
      <p className="text-[11px] text-white/30">{detalle}</p>
    </div>
  );
}
