"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export async function getVentasAction() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Incluimos los nuevos campos de resumen y el array de venta_pagos
    const { data, error } = await supabase
      .from("ventas")
      .select(
        `
        id,
        total,
        total_bruto,
        comision_total,
        total_neto,
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
          producto:productos(nombre, imagen_url)
        ),
        ventas_descuentos (
          monto_descontado,
          promocion_nombre
        ),
        venta_pagos (
          metodo_nombre,
          metodo_tipo,
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
