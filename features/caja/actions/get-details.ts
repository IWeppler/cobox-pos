"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export async function getDetallesTurnoAction(
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
          id, 
          total, 
          metodo_pago, 
          fecha_venta, 
          cliente_id,
          clientes(nombre),
          monto_cobrado,
          monto_pendiente,
          estado_pago,
          perfiles(nombre),
          ventas_items(producto:productos(nombre)),
          venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_porcentaje, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)
        `,
        )
        .gte("fecha_venta", fechaInicio)
        .lte("fecha_venta", endDate)
        .order("fecha_venta", { ascending: false }),
      supabase
        .from("venta_pagos")
        .select(
          "id, metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento, creado_en, clientes(nombre)",
        )
        .is("venta_id", null)
        .gte("creado_en", fechaInicio)
        .lte("creado_en", endDate)
        .order("creado_en", { ascending: false }),
      supabase
        .from("egresos")
        .select("id, concepto, monto, fecha, perfiles(nombre)")
        .gte("fecha", fechaInicio)
        .lte("fecha", endDate)
        .order("fecha", { ascending: false }),
    ]);

    if (ventasRes.error || egresosRes.error) {
      console.error(
        "Error fetching detalles:",
        ventasRes.error || egresosRes.error,
      );
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
