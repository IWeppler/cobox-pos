"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CajaActionState } from "@/entities/caja/types";

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

  let query = supabase.from("turnos_caja").select("*").eq("estado", "ABIERTO");

  if (config.modo_caja === "UNICA") {
    query = query.eq("modo", "UNICA");
  } else if (config.modo_caja === "POR_USUARIO") {
    query = query.eq("modo", "POR_USUARIO").eq("usuario_id", user.id);
  }

  const { data: turnoAbierto } = await query.maybeSingle();

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

  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("modo_caja")
    .single();
  const modoCaja = config?.modo_caja || "UNICA";

  let validacionQuery = supabase
    .from("turnos_caja")
    .select("id")
    .eq("estado", "ABIERTO");

  if (modoCaja === "UNICA") {
    validacionQuery = validacionQuery.eq("modo", "UNICA");
  } else {
    validacionQuery = validacionQuery
      .eq("modo", "POR_USUARIO")
      .eq("usuario_id", user.id);
  }

  const { data: turnoColision } = await validacionQuery.maybeSingle();

  if (turnoColision) {
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
  const efectivoEsperado = Number(formData.get("efectivo_esperado"));

  if (!turnoId || isNaN(montoDeclarado)) {
    return { error: "Faltan datos para cerrar la caja.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const diferenciaCaja = montoDeclarado - efectivoEsperado;

  const { error } = await supabase
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
    .eq("id", turnoId);

  if (error) {
    console.error("Error cerrando caja:", error);
    return { error: "Ocurrió un error al cerrar la caja.", success: false };
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
export async function getDetallesTurnoAction(
  turnoId: string,
  fechaInicio: string,
  fechaFin: string | null,
) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const endDate = fechaFin || new Date().toISOString();

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
        .gte("fecha", fechaInicio)
        .lte("fecha", endDate)
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

  const { error } = await supabase.from("egresos").insert({
    concepto,
    monto,
    creado_por: user.id,
  });

  if (error) {
    console.error("Error al registrar egreso:", error);
    return { error: "Ocurrió un error al guardar el gasto.", success: false };
  }

  revalidatePath("/");
  revalidatePath("/caja");

  return { error: null, success: true };
}
