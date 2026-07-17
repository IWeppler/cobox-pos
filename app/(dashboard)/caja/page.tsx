import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CajaDashboard } from "@/features/caja/ui/caja-dashboard";
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
  const turnosAbiertosIds = turnosAbiertos.map((t) => t.id);

  let ventas: VentaCaja[] = [];
  let pagosSueltos: VentaPago[] = [];
  let egresos: EgresoCaja[] = [];

  // 5. Traemos los movimientos SOLAMENTE si hay cajas abiertas
  if (turnosAbiertosIds.length > 0) {
    const [ventasRes, pagosSueltosRes, egresosRes] = await Promise.all([
      supabase
        .from("ventas")
        .select(
          "id, total, metodo_pago, fecha_venta, turno_caja_id, cliente_id, clientes(nombre), monto_cobrado, monto_pendiente, estado_pago, perfiles(nombre), ventas_items(producto:productos(nombre)), venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)",
        )
        .in("turno_caja_id", turnosAbiertosIds)
        .neq("estado_operacion", "ANULADA")
        .order("fecha_venta", { ascending: false }),
      supabase
        .from("venta_pagos")
        .select(
          "id, turno_caja_id, metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento, creado_en, clientes(nombre)",
        )
        .is("venta_id", null)
        .in("turno_caja_id", turnosAbiertosIds)
        .neq("estado_pago_operacion", "ANULADO")
        .order("creado_en", { ascending: false }),
      supabase
        .from("egresos")
        .select(
          "id, concepto, monto, fecha, creado_por, turno_caja_id, perfiles(nombre)",
        )
        .in("turno_caja_id", turnosAbiertosIds)
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

  return (
    <div className="space-y-6 mx-auto pb-12">
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
    </div>
  );
}
