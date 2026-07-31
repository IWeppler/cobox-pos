import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CajaDashboard } from "@/features/caja/ui/caja-dashboard";
import { VistaGerencial } from "@/features/caja/ui/vista-gerencial";
import { CajaVistas } from "@/features/caja/ui/caja-vistas";
import { CajaHistoryTable } from "@/features/caja/ui/caja-history-table";
import { puedeVerVistaGerencialAction } from "@/features/caja/actions/permisos-caja";
import {
  getDetalleMediosPagoAction,
  getResumenGerencialAction,
  getTotalesPorTurnoAction,
} from "@/features/caja/actions/get-resumen-gerencial";
import {
  TurnoCajaHistorial,
  VentaCaja,
  EgresoCaja,
} from "@/entities/caja/types";
import { VentaPago } from "@/entities/ventas/types";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Verificación de permisos y perfil
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre")
    .eq("id", user.id)
    .single();

  const userRole = perfil?.rol || "VENDEDOR";

  const { data: puedeCerrarAjenaRaw } = await supabase.rpc("tiene_permiso", {
    clave: "caja.cerrar_ajena",
  });
  const puedeCerrarAjena = Boolean(puedeCerrarAjenaRaw);

  // 2. Traer configuración operativa
  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("modo_caja, requiere_caja_abierta")
    .single();

  const modoCaja = config?.modo_caja || "UNICA";

  // 3. Traemos el historial de turnos (Filtrado según el rol y modo)
  let historialQuery = supabase
    .from("turnos_caja")
    .select("*, perfiles(nombre)")
    .order("fecha_apertura", { ascending: false })
    .limit(30);

  // Si no tiene caja.cerrar_ajena y opera por usuario, solo ve sus propias cajas pasadas
  if (!puedeCerrarAjena && modoCaja === "POR_USUARIO") {
    historialQuery = historialQuery.eq("vendedor_id", user.id);
  }

  const { data: turnosHistorial, error: queryError } = await historialQuery;

  if (queryError) {
    console.error("Error cargando historial:", queryError);
  }
  
  const turnos = (turnosHistorial || []) as TurnoCajaHistorial[];

  // 4. Identificamos los turnos ABIERTOS actuales
  const turnosAbiertos = turnos.filter((t) => t.estado === "ABIERTO");

  // El turno que ESTA persona opera, con la misma regla que usa CajaDashboard:
  // en POR_USUARIO cada quien tiene el suyo; en UNICA la caja es una sola
  // compartida por todo el local.
  //
  // Los movimientos se traen SOLO de este turno. Antes se traían de todos los
  // turnos abiertos visibles, y como un admin ve los ajenos, el efectivo de
  // otra cajera se sumaba a su "Efectivo en Cajón". Con un turno de otro día
  // que quedó abierto, eso aparecía como un sobrante fantasma en un turno
  // recién abierto (incidente 30/7: los 22.650 de Brisa del 20/7 aparecían en
  // la caja de Evelyn).
  const turnoPropio =
    turnosAbiertos.find((t) =>
      t.modo === "POR_USUARIO" ? t.vendedor_id === user.id : true,
    ) ?? null;

  let ventas: VentaCaja[] = [];
  let pagosSueltos: VentaPago[] = [];
  let egresos: EgresoCaja[] = [];

  // 5. Traemos los movimientos SOLAMENTE del turno propio abierto
  if (turnoPropio) {
    const [ventasRes, pagosSueltosRes, egresosRes] = await Promise.all([
      supabase
        .from("ventas")
        .select(
          "id, total, metodo_pago, fecha_venta, turno_caja_id, cliente_id, clientes(nombre), monto_cobrado, monto_pendiente, estado_pago, perfiles(nombre), ventas_items(producto:productos(nombre)), venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)",
        )
        .eq("turno_caja_id", turnoPropio.id)
        .neq("estado_operacion", "ANULADA")
        .order("fecha_venta", { ascending: false }),
      supabase
        .from("venta_pagos")
        .select(
          "id, turno_caja_id, metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento, creado_en, clientes(nombre)",
        )
        .is("venta_id", null)
        .eq("turno_caja_id", turnoPropio.id)
        .neq("estado_pago_operacion", "ANULADO")
        .order("creado_en", { ascending: false }),
      supabase
        .from("egresos")
        .select(
          "id, concepto, monto, fecha, creado_por, turno_caja_id, perfiles(nombre)",
        )
        .eq("turno_caja_id", turnoPropio.id)
        .order("fecha", { ascending: false }),
    ]);

    ventas = (ventasRes.data || []) as unknown as VentaCaja[];
    pagosSueltos = (pagosSueltosRes.data || []) as unknown as VentaPago[];
    egresos = (egresosRes.data || []) as unknown as EgresoCaja[];

    // Si es vendedor, no le mostramos los egresos que registraron otros usuarios
    if (userRole !== "ADMIN") {
      egresos = egresos.filter((e) => e.creado_por === user.id);
    }
  }

  // 6. Facturado por turno, para agrupar el historial por día. Va sobre los
  // turnos que ya trajimos, así que la RPC no amplía lo que el usuario ve.
  const totalesPorTurno = await getTotalesPorTurnoAction(turnos.map((t) => t.id));

  // 7. Vista Gerencial — solo con caja.ver_gerencial. El gate está también
  // dentro de las dos RPC (son SECURITY DEFINER y abortan con 42501), así que
  // esto es lo que decide si se renderiza, no lo que protege el dato.
  const puedeVerGerencial = await puedeVerVistaGerencialAction();

  const [resumenGerencial, detalleMedios] = puedeVerGerencial
    ? await Promise.all([
        getResumenGerencialAction(),
        getDetalleMediosPagoAction(),
      ])
    : [null, null];

  // 8. ¿Esta persona opera caja, o solo mira números? No hay un flag para
  // esto: se deduce de si tiene un turno propio abierto o abrió alguno en el
  // historial. Una dueña que nunca abrió caja cae en "no cajera" y ve la Vista
  // Gerencial directamente; si algún día tiene que atender, abre su turno
  // desde el botón de caja del navbar y a partir de ahí le aparece el toggle.
  //
  // Límite conocido: el historial trae 30 turnos, así que alguien que abrió
  // caja hace mucho y no volvió a hacerlo también cae en "no cajera".
  const tieneTurnoPropioAbierto = turnosAbiertos.some((t) =>
    t.modo === "POR_USUARIO" ? t.vendedor_id === user.id : true,
  );
  const esCajera =
    tieneTurnoPropioAbierto || turnos.some((t) => t.vendedor_id === user.id);

  return (
    <div className="space-y-6 mx-auto pb-12 p-4">
      <CajaVistas
        esCajera={esCajera}
        vistaInicial={tieneTurnoPropioAbierto ? "mi-turno" : "general"}
        miTurno={
          <CajaDashboard
            turnosAbiertos={turnosAbiertos}
            ventas={ventas}
            pagosSueltos={pagosSueltos}
            egresos={egresos}
            historial={turnos}
            modoCaja={modoCaja}
            userRole={userRole}
            userId={user.id}
          />
        }
        general={
          resumenGerencial?.data ? (
            <VistaGerencial
              resumen={resumenGerencial.data}
              detalle={detalleMedios?.data ?? []}
            />
          ) : undefined
        }
      />

      {/* Fuera del toggle: el historial es útil en las dos vistas. */}
      <CajaHistoryTable
        historial={turnos}
        totalesPorTurno={totalesPorTurno ?? undefined}
      />
    </div>
  );
}
