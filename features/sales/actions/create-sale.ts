"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CreateSalePaymentInput } from "@/entities/ventas/types";

export async function registrarVentaAction(
  prevState: { error: string | null; success: boolean },
  formData: FormData,
) {
  const cartData = formData.get("cart_items") as string;
  const promocionId = formData.get("promocion_id") as string | null;
  const descuentoMonto = Number(formData.get("descuento_monto") || 0);

  // 🚀 SOPORTE MIXTO Y RETROCOMPATIBILIDAD
  const pagosRaw = formData.get("pagos") as string;
  const metodoPagoIdLegacy = formData.get("metodo_pago_id") as string;

  // 🚀 CRM: CUENTA CORRIENTE
  const clienteId = formData.get("cliente_id") as string | null;

  if (!cartData) return { error: "El carrito está vacío.", success: false };
  const items = JSON.parse(cartData) as any[];
  if (items.length === 0) return { error: "Agrega productos.", success: false };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "No autorizado.", success: false };

  // --- BLOQUEO DE CAJA ---
  const { data: turnoAbierto } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("estado", "ABIERTO")
    .single();
  if (!turnoAbierto) return { error: "CAJA_CERRADA", success: false };

  // --- FETCH MÉTODOS DE PAGO ---
  const { data: metodosDb } = await supabase.from("metodos_pago").select("*");
  if (!metodosDb)
    return { error: "Error consultando métodos de pago.", success: false };
  const metodosMap = Object.fromEntries(metodosDb.map((m) => [m.id, m]));

  // --- PRE-CARGA PROMOCIÓN ---
  let promoData = null;
  let categoriasPromo: string[] = [];
  if (promocionId && promocionId !== "ninguna" && descuentoMonto > 0) {
    const { data: promo } = await supabase
      .from("promociones")
      .select("*")
      .eq("id", promocionId)
      .single();
    if (promo) {
      promoData = promo;
      if (promo.tipo_regla === "CATEGORIA") {
        const { data: cats } = await supabase
          .from("promociones_categorias")
          .select("categoria_nombre")
          .eq("promocion_id", promocionId);
        if (cats)
          categoriasPromo = cats.map((c) => c.categoria_nombre.toLowerCase());
      }
    }
  }

  let totalElegible = 0;
  items.forEach((item) => {
    const elegible =
      !promoData || promoData.tipo_regla !== "CATEGORIA"
        ? true
        : categoriasPromo.includes((item.tipo || "").toLowerCase());
    if (elegible)
      totalElegible +=
        Number(item.precioUnitario ?? item.precio ?? 0) *
        Number(item.cantidad ?? 1);
  });

  // --- 1. VALIDAR STOCK Y PRORRATEAR DESCUENTOS ---
  const itemsProcesados = [];
  let totalVenta = 0;
  let costoTotalVenta = 0;

  for (const item of items) {
    const productoIdReal = item.productoId ?? item.id;
    const { data: stockActual } = await supabase
      .from("productos_stock")
      .select("cantidad, id, producto:productos(precio_costo)")
      .eq("producto_id", productoIdReal)
      .eq("variante", item.variante)
      .single();

    if (!stockActual)
      return { error: `Error de stock en ${item.variante}.`, success: false };

    const precioCostoReal = Number(
      (stockActual.producto as any)?.precio_costo || 0,
    );
    const precioUnitario = Number(item.precioUnitario ?? item.precio ?? 0);
    const cantidadFinal = Number(item.cantidad ?? 1);

    const elegible =
      !promoData || promoData.tipo_regla !== "CATEGORIA"
        ? true
        : categoriasPromo.includes((item.tipo || "").toLowerCase());
    let itemDescuentoMonto = 0;
    let itemPrecioFinal = precioUnitario;

    if (promoData && elegible && totalElegible > 0) {
      const pesoItem = (precioUnitario * cantidadFinal) / totalElegible;
      const descuentoTotalLinea = descuentoMonto * pesoItem;
      itemDescuentoMonto = descuentoTotalLinea / cantidadFinal;
      itemPrecioFinal = precioUnitario - itemDescuentoMonto;
    }

    totalVenta += precioUnitario * cantidadFinal;
    costoTotalVenta += precioCostoReal * cantidadFinal;

    itemsProcesados.push({
      productoId: productoIdReal,
      variante: item.variante,
      cantidad: cantidadFinal,
      stockId: stockActual.id,
      stockOriginal: stockActual.cantidad,
      precioCosto: precioCostoReal,
      precioUnitario: precioUnitario,
      descuentoMonto: itemDescuentoMonto,
      precioFinal: itemPrecioFinal,
    });
  }

  const totalSeguro = isNaN(totalVenta) ? 0 : totalVenta;
  const costoSeguro = isNaN(costoTotalVenta) ? 0 : costoTotalVenta;
  const totalConDescuento = Math.max(
    0,
    totalSeguro - (isNaN(descuentoMonto) ? 0 : descuentoMonto),
  );

  // --- 2. 🚀 PREPARACIÓN DEL ARRAY DE PAGOS ---
  let pagos: CreateSalePaymentInput[] = [];

  if (pagosRaw) {
    pagos = JSON.parse(pagosRaw);
  } else if (metodoPagoIdLegacy) {
    pagos = [
      { metodoPagoId: metodoPagoIdLegacy, montoAsignado: totalConDescuento },
    ];
  } else {
    return { error: "No se asignó un método de pago.", success: false };
  }

  if (pagos.length === 0) {
    return { error: "La lista de pagos no puede estar vacía.", success: false };
  }

  const sumaPagos = pagos.reduce((acc, p) => acc + Number(p.montoAsignado), 0);

  // 🚀 LÓGICA DE CUENTA CORRIENTE
  const montoPendiente = totalConDescuento - sumaPagos;
  const estadoPago = montoPendiente > 0.05 ? "PARCIAL" : "PAGADA";

  if (montoPendiente > 0.05 && !clienteId) {
    return {
      error: "Para dejar un saldo pendiente debes seleccionar un cliente.",
      success: false,
    };
  }

  // Prevenir sobre-pagos (Errores de tipeo del cajero)
  if (sumaPagos > totalConDescuento + 0.05) {
    return {
      error: "Los pagos asignados superan el total de la venta.",
      success: false,
    };
  }

  // --- 3. CÁLCULO FINANCIERO MASIVO (Iterando los pagos) ---
  let comisionTotalGeneral = 0;
  let totalNetoGeneral = 0;
  const ventaPagosPayloads = [];

  for (const pago of pagos) {
    const metodoData = metodosMap[pago.metodoPagoId];
    if (!metodoData)
      return { error: "Método de pago inválido.", success: false };

    const montoBruto = Number(pago.montoAsignado);
    const comisionPorcentaje = Number(metodoData.comision || 0);
    const comisionMonto = (montoBruto * comisionPorcentaje) / 100;
    const montoNeto = montoBruto - comisionMonto;

    comisionTotalGeneral += comisionMonto;
    totalNetoGeneral += montoNeto;

    ventaPagosPayloads.push({
      metodo_pago_id: metodoData.id,
      metodo_nombre: metodoData.nombre,
      metodo_tipo: metodoData.tipo,
      monto_bruto: montoBruto,
      comision_porcentaje: comisionPorcentaje,
      comision_monto: comisionMonto,
      monto_neto: montoNeto,
      acreditacion_dias: metodoData.acreditacion_dias || 0,
    });
  }

  let metodoPagoSafe = "PAGO_MIXTO";
  if (pagos.length === 1) {
    const m = metodosMap[pagos[0].metodoPagoId];
    if (m.tipo === "TRANSFERENCIA") metodoPagoSafe = "TRANSFERENCIA";
    else if (m.tipo === "TARJETA" || m.tipo === "BILLETERA_VIRTUAL")
      metodoPagoSafe = "TARJETA";
    else metodoPagoSafe = "EFECTIVO";
  }

  const payloadVentas = {
    vendedor_id: user.id,
    cliente_id: clienteId || null,
    metodo_pago: metodoPagoSafe,
    total: totalConDescuento,
    precio_costo: costoSeguro,
    cantidad: items.length,
    total_bruto: totalConDescuento,
    comision_total: comisionTotalGeneral,
    total_neto: totalNetoGeneral,
    es_pago_mixto: pagos.length > 1,
    monto_cobrado: sumaPagos,
    monto_pendiente: montoPendiente > 0 ? montoPendiente : 0,
    estado_pago: estadoPago,
  };

  // --- 4. CREAR LA CABECERA (ventas) ---
  const { data: nuevaVenta, error: ventaError } = await supabase
    .from("ventas")
    .insert(payloadVentas)
    .select("id")
    .single();

  if (ventaError || !nuevaVenta) {
    return {
      error: `Fallo en BD (Ventas): ${ventaError.message}`,
      success: false,
    };
  }

  // --- 5. REGISTRAR DEUDA EN CUENTA CORRIENTE (Si aplica) ---
  if (montoPendiente > 0.05 && clienteId) {
    const { error: ccError } = await supabase
      .from("cuenta_corriente_movimientos")
      .insert({
        cliente_id: clienteId,
        venta_id: nuevaVenta.id,
        tipo: "DEBITO",
        monto: montoPendiente,
        descripcion: `Compra Parcial - Ticket #${nuevaVenta.id.split("-")[0].toUpperCase()}`,
        creado_por: user.id,
      });

    if (ccError) console.error("Error al registrar deuda en CC:", ccError);
  }

  // --- 6. REGISTRAR EL DESGLOSE DE PAGOS (venta_pagos) ---
  const pagosToInsert = ventaPagosPayloads.map((p) => ({
    ...p,
    venta_id: nuevaVenta.id,
  }));

  const { error: pagoError } = await supabase
    .from("venta_pagos")
    .insert(pagosToInsert);

  if (pagoError) {
    return {
      error: `Fallo en BD (Venta Pagos): ${pagoError.message}`,
      success: false,
    };
  }

  // --- 7. REGISTRAR TRAZABILIDAD DEL DESCUENTO ---
  if (
    promocionId &&
    promocionId !== "ninguna" &&
    descuentoMonto > 0 &&
    promoData
  ) {
    await supabase.from("ventas_descuentos").insert({
      venta_id: nuevaVenta.id,
      promocion_id: promocionId,
      promocion_nombre: promoData.nombre,
      tipo_descuento: promoData.tipo_descuento,
      monto_descontado: descuentoMonto,
    });

    await supabase
      .from("promociones")
      .update({
        usos_actuales: (promoData.usos_actuales || 0) + 1,
      })
      .eq("id", promocionId);
  }

  // --- 8. CREAR LOS DETALLES (ventas_items) ---
  const insertItems = itemsProcesados.map((item) => ({
    venta_id: nuevaVenta.id,
    producto_id: item.productoId,
    variante: item.variante,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    precio_costo: item.precioCosto,
    descuento_monto: item.descuentoMonto,
    precio_final: item.precioFinal,
    promocion_id: promoData && item.descuentoMonto > 0 ? promocionId : null,
    promocion_nombre:
      promoData && item.descuentoMonto > 0 ? promoData.nombre : null,
  }));

  const { error: itemsError } = await supabase
    .from("ventas_items")
    .insert(insertItems);

  if (itemsError) {
    return {
      error: `Fallo en BD (Ventas Items): ${itemsError.message}`,
      success: false,
    };
  }

  // --- 9. DESCONTAR STOCK ---
  for (const item of itemsProcesados) {
    await supabase
      .from("productos_stock")
      .update({ cantidad: item.stockOriginal - item.cantidad })
      .eq("id", item.stockId);
  }

  revalidatePath("/", "layout");
  return { error: null, success: true };
}
