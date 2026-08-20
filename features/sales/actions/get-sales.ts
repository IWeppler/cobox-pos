"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export async function getVentasAction(opts?: { soloPropias?: boolean }) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Incluimos los nuevos campos de resumen y el array de venta_pagos
    let query = supabase
      .from("ventas")
      .select(
        `
        id,
        total,
        total_bruto,
        comision_total,
        total_neto,
        recargo_metodo_total,
        es_pago_mixto,
        precio_costo,
        cantidad,
        fecha_venta,
        estado_operacion,
        metodo_pago,
        monto_cobrado,
        monto_pendiente,
        estado_pago,
        cliente_id,
        clientes(nombre),
        perfiles(nombre),
        ventas_items (
          cantidad,
          precio_unitario,
          variante,
          descuento_monto,
          precio_final,
          promocion_nombre,
          producto:productos(nombre, imagen_url, unidad_medida),
          unidad_serie:unidades_serie(id, imei, fecha_venta)
        ),
        ventas_descuentos (
          monto_descontado,
          promocion_nombre
        ),
        comprobantes (
          tipo,
          punto_venta,
          numero,
          cae
        ),
        venta_pagos (
          metodo_nombre,
          metodo_tipo,
          monto_base,
          recargo_porcentaje,
          recargo_monto,
          monto_bruto,
          comision_porcentaje,
          comision_monto,
          monto_neto,
          acreditacion_dias,
          tipo_movimiento,
          estado_pago_operacion
        )
      `,
      )
      .order("fecha_venta", { ascending: false });

    if (opts?.soloPropias) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) query = query.eq("vendedor_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching ventas:", error);
      return { data: null, error: "No se pudo cargar el historial de ventas." };
    }

    return { data, error: null };
  } catch (err) {
    console.error("Unexpected error in getVentasAction:", err);
    return {
      data: null,
      error: "Ocurrió un error inesperado al obtener las ventas.",
    };
  }
}

/**
 * Cobros de cuenta corriente: filas de venta_pagos SIN venta_id.
 *
 * Existe aparte de getVentasAction porque estos pagos no cuelgan de ninguna
 * venta y, por lo tanto, nunca llegaban a Reportes: la comisión que retiene
 * el procesador al cobrar una deuda con tarjeta se veía en el arqueo de Caja
 * pero no en el dashboard, sobreestimando la ganancia neta.
 *
 * Devuelve el bruto además de la comisión para que el desglose por método de
 * Reportes cierre contra el de Caja; el capital cobrado NO se suma a ingresos
 * (ver getDashboardMetrics: el ticket fiado ya computó su total).
 */
export async function getPagosCuentaCorrienteAction() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
      .from("venta_pagos")
      .select(
        "id, metodo_nombre, metodo_tipo, monto_base, recargo_porcentaje, recargo_monto, monto_bruto, comision_porcentaje, comision_monto, monto_neto, tipo_movimiento, estado_pago_operacion, creado_en",
      )
      .is("venta_id", null)
      .order("creado_en", { ascending: false });

    if (error) {
      console.error("Error fetching pagos de cuenta corriente:", error);
      return { data: null, error: "No se pudieron cargar los cobros de deuda." };
    }

    return { data, error: null };
  } catch (err) {
    console.error("Unexpected error in getPagosCuentaCorrienteAction:", err);
    return {
      data: null,
      error: "Ocurrió un error inesperado al obtener los cobros de deuda.",
    };
  }
}
