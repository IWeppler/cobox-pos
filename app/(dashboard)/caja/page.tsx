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

  // 1. Verificación de permisos
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (perfil?.rol !== "ADMIN") redirect("/stock");

  // 2. Traemos el historial de turnos completos
  const { data: turnosHistorial } = await supabase
    .from("turnos_caja")
    .select("*, perfiles(nombre)")
    .order("fecha_apertura", { ascending: false })
    .limit(30);

  const turnos = (turnosHistorial || []) as TurnoCajaHistorial[];

  // 3. Identificamos si hay uno abierto
  const turnoAbierto = turnos.find((t) => t.estado === "ABIERTO") || null;

  let ventas: VentaCaja[] = [];
  let pagosSueltos: VentaPago[] = [];
  let egresos: EgresoCaja[] = [];

  // 4. Traemos los movimientos del turno (Ventas, Cobros de Deudas y Gastos)
  if (turnoAbierto) {
    const [ventasRes, pagosSueltosRes, egresosRes] = await Promise.all([
      supabase
        .from("ventas")
        .select(
          "id, total, metodo_pago, fecha_venta, cliente_id, clientes(nombre), monto_cobrado, monto_pendiente, estado_pago, perfiles(nombre), ventas_items(producto:productos(nombre)), venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)",
        )
        .gte("fecha_venta", turnoAbierto.fecha_apertura)
        .order("fecha_venta", { ascending: false }),
      supabase
        .from("venta_pagos")
        .select(
          "id, metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento, creado_en, clientes(nombre)",
        )
        .is("venta_id", null) // 🚀 Pagos sin venta (Ej: Pago de Cuenta Corriente)
        .gte("creado_en", turnoAbierto.fecha_apertura)
        .order("creado_en", { ascending: false }),
      supabase
        .from("egresos")
        .select("id, concepto, monto, fecha, perfiles(nombre)")
        .gte("fecha", turnoAbierto.fecha_apertura)
        .order("fecha", { ascending: false }),
    ]);

    ventas = (ventasRes.data || []) as unknown as VentaCaja[];
    pagosSueltos = pagosSueltosRes.data || [];
    egresos = (egresosRes.data || []) as unknown as EgresoCaja[];
  }

  return (
    <div className="space-y-6 mx-auto pb-12">
      <CajaDashboard
        turno={turnoAbierto}
        ventas={ventas}
        pagosSueltos={pagosSueltos}
        egresos={egresos}
        historial={turnos}
      />
    </div>
  );
}
