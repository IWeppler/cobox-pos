"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CajaActionState } from "@/entities/caja/types";
import { resolverTurnoActivo } from "@/entities/caja/lib/resolve-turno-activo";

// ============================================================================
// 1. OBTENER CAJA ACTIVA (Según Configuración)
// ============================================================================
export async function getTurnoActivoAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { turno: null, config: null, error: "No autorizado" };

  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("modo_caja, requiere_caja_abierta")
    .single();

  if (!config)
    return { turno: null, config: null, error: "Configuración no encontrada" };

  const { turnoId } = await resolverTurnoActivo(supabase, user.id);

  if (!turnoId) return { turno: null, config, error: null };

  const { data: turnoAbierto } = await supabase
    .from("turnos_caja")
    .select("*")
    .eq("id", turnoId)
    .single();

  return { turno: turnoAbierto || null, config, error: null };
}

// ============================================================================
// 2. ABRIR TURNO SEGÚN MODO
// ============================================================================
export async function abrirTurnoAction(
  prevState: CajaActionState,
  formData: FormData,
) {
  const montoInicial = Number(formData.get("monto_inicial"));

  if (isNaN(montoInicial) || montoInicial < 0) {
    return { error: "Ingresa un monto inicial válido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autorizado.", success: false };

  const { turnoId: turnoColisionId, modoCaja } = await resolverTurnoActivo(
    supabase,
    user.id,
  );

  if (turnoColisionId) {
    return {
      error: `Ya existe una caja abierta en modo ${modoCaja.replace("_", " ")}.`,
      success: false,
    };
  }

  const { error } = await supabase.from("turnos_caja").insert({
    modo: modoCaja,
    usuario_id: modoCaja === "POR_USUARIO" ? user.id : null,
    vendedor_id: user.id,
    abierta_por: user.id,
    monto_inicial: montoInicial,
    efectivo_esperado: montoInicial,
    estado: "ABIERTO",
  });

  if (error) {
    console.error("Error abriendo caja:", error);
    return { error: "Ocurrió un error al abrir la caja.", success: false };
  }

  revalidatePath("/caja");
  revalidatePath("/");
  revalidatePath("/", "layout");
  revalidatePath("/pos");
  return { error: null, success: true };
}

// ============================================================================
// 3. CERRAR TURNO
// ============================================================================
export async function cerrarTurnoAction(
  prevState: CajaActionState,
  formData: FormData,
) {
  const turnoId = formData.get("turno_id") as string;
  const montoDeclarado = Number(formData.get("monto_final"));

  if (!turnoId || isNaN(montoDeclarado)) {
    return { error: "Faltan datos para cerrar la caja.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: turno, error: turnoError } = await supabase
    .from("turnos_caja")
    .select("monto_inicial, estado")
    .eq("id", turnoId)
    .single();

  if (turnoError || !turno) {
    return { error: "No se encontró el turno a cerrar.", success: false };
  }
  if (turno.estado !== "ABIERTO") {
    return { error: "Esta caja ya fue cerrada.", success: false };
  }

  // Recalculamos el efectivo esperado server-side. El cliente ya no envía
  // este valor: se ignora cualquier dato de efectivo_esperado que llegue
  // por formData.
  //
  // El total de egresos se calcula vía RPC (SECURITY DEFINER) en vez de un
  // SELECT directo: en modo_caja='UNICA' varios cajeros no-admin comparten
  // el mismo turno_caja_id, y la policy egresos_select_propio_o_admin solo
  // deja ver a cada uno sus propios egresos. Un SUM corrido con la sesión
  // del cajero que cierra subestimaría el total e inflaría el esperado.
  const [ventaPagosRes, egresosSumRes] = await Promise.all([
    supabase
      .from("venta_pagos")
      .select("monto_bruto")
      .eq("turno_caja_id", turnoId)
      .eq("metodo_tipo", "EFECTIVO")
      .neq("estado_pago_operacion", "ANULADO"),
    supabase.rpc("calcular_egresos_turno", { p_turno_id: turnoId }),
  ]);

  if (egresosSumRes.error) {
    console.error("Error calculando egresos del turno:", egresosSumRes.error);
    return { error: "Ocurrió un error al calcular el cierre.", success: false };
  }

  const ingresosEfectivo = (ventaPagosRes.data || []).reduce(
    (acc, p) => acc + Number(p.monto_bruto),
    0,
  );
  const totalEgresos = Number(egresosSumRes.data ?? 0);

  const efectivoEsperado =
    Number(turno.monto_inicial) + ingresosEfectivo - totalEgresos;
  const diferenciaCaja = montoDeclarado - efectivoEsperado;

  const { data: turnoCerrado, error } = await supabase
    .from("turnos_caja")
    .update({
      monto_final: montoDeclarado,
      monto_declarado: montoDeclarado,
      efectivo_esperado: efectivoEsperado,
      diferencia: diferenciaCaja,
      cerrada_por: user?.id,
      fecha_cierre: new Date().toISOString(),
      estado: "CERRADO",
    })
    .eq("id", turnoId)
    .eq("estado", "ABIERTO")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Error cerrando caja:", error);
    return { error: "Ocurrió un error al cerrar la caja.", success: false };
  }
  if (!turnoCerrado) {
    return { error: "Esta caja ya fue cerrada.", success: false };
  }

  revalidatePath("/caja");
  revalidatePath("/");
  revalidatePath("/", "layout");
  revalidatePath("/pos");
  return { error: null, success: true };
}

// ============================================================================
// 4. OBTENER DETALLES DEL TURNO (Cierre Z / Auditoría)
// ============================================================================
export async function getDetallesTurnoAction(turnoId: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const [ventasRes, pagosSueltosRes, egresosRes] = await Promise.all([
      supabase
        .from("ventas")
        .select(
          `
          id, total, metodo_pago, fecha_venta, cliente_id, clientes(nombre),
          monto_cobrado, monto_pendiente, estado_pago, perfiles(nombre),
          ventas_items(producto:productos(nombre)),
          venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_porcentaje, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)
        `,
        )
        .eq("turno_caja_id", turnoId)
        .neq("estado_operacion", "ANULADA")
        .order("fecha_venta", { ascending: false }),
      supabase
        .from("venta_pagos")
        .select(
          "id, metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento, creado_en, clientes(nombre)",
        )
        .eq("turno_caja_id", turnoId)
        .is("venta_id", null)
        .neq("estado_pago_operacion", "ANULADO")
        .order("creado_en", { ascending: false }),
      supabase
        .from("egresos")
        .select("id, concepto, monto, fecha, perfiles(nombre)")
        .eq("turno_caja_id", turnoId)
        .order("fecha", { ascending: false }),
    ]);

    if (ventasRes.error) {
      console.error("Error fetching detalles ventas:", ventasRes.error);
      return { data: null, error: "No se pudieron cargar los movimientos." };
    }

    return {
      data: {
        ventas: ventasRes.data || [],
        pagosSueltos: pagosSueltosRes.data || [],
        egresos: egresosRes.data || [],
      },
      error: null,
    };
  } catch (err) {
    console.error("Unexpected error:", err);
    return { data: null, error: "Error inesperado en auditoría." };
  }
}

export async function registrarEgresoAction(
  prevState: CajaActionState,
  formData: FormData,
) {
  const concepto = formData.get("concepto") as string;
  const monto = Number(formData.get("monto"));

  if (!concepto || !monto || monto <= 0) {
    return { error: "Ingresa un concepto y un monto válido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autorizado.", success: false };
  }

  const { turnoId, requiereCajaAbierta } = await resolverTurnoActivo(
    supabase,
    user.id,
  );

  if (requiereCajaAbierta && !turnoId) {
    return {
      error: "Necesitas abrir la caja antes de registrar un gasto.",
      success: false,
    };
  }

  const { error } = await supabase.from("egresos").insert({
    concepto,
    monto,
    creado_por: user.id,
    turno_caja_id: turnoId,
  });

  if (error) {
    console.error("Error al registrar egreso:", error);
    return { error: "Ocurrió un error al guardar el gasto.", success: false };
  }

  revalidatePath("/");
  revalidatePath("/caja");

  return { error: null, success: true };
}
