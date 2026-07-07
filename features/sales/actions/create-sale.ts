"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CreateSalePaymentInput } from "@/entities/ventas/types";
import { resolverTurnoActivo } from "@/entities/caja/lib/resolve-turno-activo";

export async function registrarVentaAction(
  prevState: { error: string | null; success: boolean },
  formData: FormData,
) {
  const cartData = formData.get("cart_items") as string;
  const promocionId = formData.get("promocion_id") as string | null;
  const descuentoMonto = Number(formData.get("descuento_monto") || 0);
  const pagosRaw = formData.get("pagos") as string;

  // REGLAS DE NEGOCIO CRM Y CC
  const isCuentaCorriente = formData.get("is_cuenta_corriente") === "true";
  const recargoCC = Number(formData.get("recargo_cc") || 0);
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

  // BLOQUEO Y ASIGNACIÓN DE CAJA (MODO DINÁMICO)
  const { turnoId: turnoAbiertoId, requiereCajaAbierta: requiereCaja } =
    await resolverTurnoActivo(supabase, user.id);

  if (requiereCaja && !turnoAbiertoId) {
    return { error: "CAJA_CERRADA", success: false };
  }

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
  let totalVentaBrutaItems = 0;
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

    totalVentaBrutaItems += precioUnitario * cantidadFinal;
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

  // Calculamos el Total Real del Ticket
  const totalConDescuentoYRecargo =
    Math.max(0, totalVentaBrutaItems - descuentoMonto) +
    (isNaN(recargoCC) ? 0 : recargoCC);

  // --- 2. VALIDACIÓN DEL ARRAY DE PAGOS ---
  const pagosRawArray: CreateSalePaymentInput[] = pagosRaw
    ? JSON.parse(pagosRaw)
    : [];
  const pagosValidos = pagosRawArray.filter((p) => Number(p.montoAsignado) > 0);
  const sumaPagos = pagosValidos.reduce(
    (acc, p) => acc + Number(p.montoAsignado),
    0,
  );

  const montoPendiente = totalConDescuentoYRecargo - sumaPagos;
  const estadoPago = montoPendiente > 0.05 ? "PARCIAL" : "PAGADA";

  if (isCuentaCorriente && !clienteId) {
    return {
      error: "Debes seleccionar un cliente para generar una deuda.",
      success: false,
    };
  }
  if (!isCuentaCorriente && montoPendiente > 0.05) {
    return {
      error: "Venta contado: El pago no cubre el total del ticket.",
      success: false,
    };
  }
  if (sumaPagos > totalConDescuentoYRecargo + 0.05) {
    return {
      error: "Los cobros asignados superan el total del ticket.",
      success: false,
    };
  }

  // --- 3. CÁLCULO FINANCIERO MASIVO ---
  let comisionTotalGeneral = 0;
  let totalNetoGeneral = 0;
  const ventaPagosPayloads = [];

  for (const pago of pagosValidos) {
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
      turno_caja_id: turnoAbiertoId,
    });
  }

  let metodoPagoSafe =
    isCuentaCorriente && pagosValidos.length === 0
      ? "CUENTA_CORRIENTE"
      : "PAGO_MIXTO";
  if (pagosValidos.length === 1) {
    const m = metodosMap[pagosValidos[0].metodoPagoId];
    if (m.tipo === "TRANSFERENCIA") metodoPagoSafe = "TRANSFERENCIA";
    else if (m.tipo === "TARJETA" || m.tipo === "BILLETERA_VIRTUAL")
      metodoPagoSafe = "TARJETA";
    else metodoPagoSafe = "EFECTIVO";
  }

  const payloadVentas = {
    vendedor_id: user.id,
    cliente_id: clienteId || null,
    turno_caja_id: turnoAbiertoId,
    estado_operacion: "CONFIRMADA",
    metodo_pago: metodoPagoSafe,
    total: totalConDescuentoYRecargo,
    precio_costo: isNaN(costoTotalVenta) ? 0 : costoTotalVenta,
    cantidad: items.length,
    total_bruto: totalConDescuentoYRecargo,
    comision_total: comisionTotalGeneral,
    total_neto: totalNetoGeneral,
    es_pago_mixto: pagosValidos.length > 1,
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
  if (ventaError || !nuevaVenta)
    return { error: `Fallo en BD: ${ventaError.message}`, success: false };

  // --- 5. REGISTRAR DEUDA EN CUENTA CORRIENTE ---
  if (isCuentaCorriente && montoPendiente > 0.05 && clienteId) {
    const { error: ccError } = await supabase
      .from("cuenta_corriente_movimientos")
      .insert({
        cliente_id: clienteId,
        venta_id: nuevaVenta.id,
        tipo: "DEBITO",
        monto: montoPendiente,
        descripcion: `Compra Fiada - Ticket #${nuevaVenta.id.split("-")[0].toUpperCase()}`,
        creado_por: user.id,
      });
    if (ccError) console.error("Error al registrar deuda en CC:", ccError);

    const { data: clienteActual } = await supabase
      .from("clientes")
      .select("saldo_pendiente")
      .eq("id", clienteId)
      .single();

    if (clienteActual) {
      await supabase
        .from("clientes")
        .update({
          saldo_pendiente:
            Number(clienteActual.saldo_pendiente || 0) + montoPendiente,
        })
        .eq("id", clienteId);
    }
  }

  // --- 6. REGISTRAR EL DESGLOSE DE PAGOS ---
  if (pagosValidos.length > 0) {
    const pagosToInsert = ventaPagosPayloads.map((p) => ({
      ...p,
      venta_id: nuevaVenta.id,
    }));
    const { error: pagoError } = await supabase
      .from("venta_pagos")
      .insert(pagosToInsert);
    if (pagoError)
      return {
        error: `Fallo guardando pago: ${pagoError.message}`,
        success: false,
      };
  }

  // --- 7. TRAZABILIDAD DEL DESCUENTO ---
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
      .update({ usos_actuales: (promoData.usos_actuales || 0) + 1 })
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

  await supabase.from("ventas_items").insert(insertItems);

  // --- 9. DESCONTAR STOCK ---
  for (const item of itemsProcesados) {
    await supabase
      .from("productos_stock")
      .update({ cantidad: item.stockOriginal - item.cantidad })
      .eq("id", item.stockId);
  }

  revalidatePath("/", "layout");
  return { error: null, success: true, ventaId: nuevaVenta.id };
}
