"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CreateSalePaymentInput } from "@/entities/ventas/types";
import { resolverTurnoActivo } from "@/entities/caja/lib/resolve-turno-activo";
import { calcularPagosConRecargo } from "@/shared/lib/recargo-metodo";
import { emitirComprobante } from "../lib/emitir-comprobante";

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
  // Exención del recargo CC decidida por la vendedora en el ticket. Es la
  // ÚNICA cosa del cálculo de plata que sí se toma del cliente, y a propósito:
  // es una decisión comercial puntual (cliente de confianza, arreglo previo)
  // que no puede salir de la config, porque la config es global.
  const ccSinRecargo = formData.get("cc_sin_recargo") === "true";
  const clienteId = formData.get("cliente_id") as string | null;
  const reservaIdsRaw = formData.get("reserva_ids") as string | null;
  const reservaIds: string[] = reservaIdsRaw ? JSON.parse(reservaIdsRaw) : [];

  // Unidades serializadas elegidas en el modal: [{varianteId, unidadId}].
  // Vacío para todo lo que no usa unidades_serie, que es el caso normal.
  const unidadesRaw = formData.get("unidades_serie") as string | null;
  const unidadesElegidas: { varianteId: string; unidadId: string }[] =
    unidadesRaw ? JSON.parse(unidadesRaw) : [];

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

  // --- 0. RESOLVER PRECIO Y COSTO REALES SERVER-SIDE ---
  // item.precio / item.precioUnitario vienen del cliente y son solo para
  // pintar el carrito antes de confirmar: cualquiera con el request
  // interceptado podría mandar el valor que quiera. El precio (y el costo,
  // que define el margen reportado) que efectivamente se cobra y persiste
  // sale siempre de la variante o, si esta no tiene su propio valor, del
  // producto — nunca del payload del cliente.
  const itemsResueltos = [];
  for (const item of items) {
    const productoIdReal = item.productoId ?? item.id;

    const { data: stockActual } = await supabase
      .from("productos_stock")
      .select("cantidad, id, producto:productos(precio, precio_costo)")
      .eq("producto_id", productoIdReal)
      .eq("variante", item.variante)
      .single();

    if (!stockActual)
      return { error: `Error de stock en ${item.variante}.`, success: false };

    const productoData = stockActual.producto as any;
    const precioProducto = Number(productoData?.precio) || 0;
    const costoProducto = Number(productoData?.precio_costo) || 0;

    // Match por PK cuando el carrito trae varianteId (sin ambigüedad
    // posible). Si no viene — carrito armado antes de este cambio, todavía
    // en localStorage, o producto sin variante real — caemos al match por
    // nombre_display; si tampoco encuentra nada ahí, dejamos rastro en vez
    // de heredar el precio de producto en silencio.
    let varianteData: {
      id: string;
      precio: number | null;
      costo: number | null;
    } | null = null;
    if (item.varianteId) {
      const { data } = await supabase
        .from("producto_variantes")
        .select("id, precio, costo")
        .eq("id", item.varianteId)
        .maybeSingle();
      varianteData = data;
    } else {
      const { data } = await supabase
        .from("producto_variantes")
        .select("id, precio, costo")
        .eq("producto_id", productoIdReal)
        .eq("nombre_display", item.variante)
        .maybeSingle();
      varianteData = data;

      if (!varianteData) {
        console.warn("[VENTA VARIANTE SIN MATCH]", {
          vendedorId: user.id,
          productoId: productoIdReal,
          variante: item.variante,
        });
      }
    }

    const precioServer =
      varianteData?.precio != null
        ? Number(varianteData.precio)
        : precioProducto;
    const costoServer =
      varianteData?.costo != null ? Number(varianteData.costo) : costoProducto;

    const precioCliente = Number(item.precioUnitario ?? item.precio ?? 0);
    if (Math.abs(precioCliente - precioServer) > 0.01) {
      console.error("[VENTA PRECIO MISMATCH]", {
        vendedorId: user.id,
        productoId: productoIdReal,
        variante: item.variante,
        precioCliente,
        precioServer,
      });
    }

    itemsResueltos.push({
      productoIdReal,
      variante: item.variante,
      varianteId: item.varianteId ?? varianteData?.id ?? null,
      tipo: item.tipo,
      cantidad: Number(item.cantidad ?? 1),
      stockActual,
      precioServer,
      costoServer,
    });
  }

  // --- 0bis. RESOLVER QUÉ LÍNEAS REQUIEREN UNIDAD SERIALIZADA ---
  // Espejo server-side de lo que el POS marca en el carrito. Esa marca es
  // client-side y por lo tanto bypasseable llamando esta action directo:
  // la regla real de "esta variante no se vende sin elegir aparato" se
  // decide acá, contra la base, y es fail-closed (si la variante tiene
  // unidades disponibles y no vino ninguna elegida, la venta se rechaza).
  //
  // Una variante SIN unidades disponibles no requiere nada y sigue el
  // camino de siempre: es toda la indumentaria y los accesorios.
  const varianteIdsCarrito = itemsResueltos
    .map((i) => i.varianteId)
    .filter((id): id is string => Boolean(id));

  const disponiblesPorVariante = new Map<string, number>();
  if (varianteIdsCarrito.length > 0) {
    const { data: unidadesLibres, error: unidadesError } = await supabase
      .from("unidades_serie")
      .select("producto_variante_id")
      .in("producto_variante_id", varianteIdsCarrito)
      .eq("estado", "disponible");

    if (unidadesError) {
      console.error("[VENTA] Error consultando unidades_serie:", unidadesError);
      return {
        error: "No se pudo verificar las unidades con número de serie.",
        success: false,
      };
    }

    for (const row of unidadesLibres ?? []) {
      const vId = row.producto_variante_id as string;
      disponiblesPorVariante.set(vId, (disponiblesPorVariante.get(vId) ?? 0) + 1);
    }
  }

  const unidadPorVariante = new Map(
    unidadesElegidas
      .filter((u) => u?.varianteId && u?.unidadId)
      .map((u) => [u.varianteId, u.unidadId]),
  );

  // Pares (unidad, variante) que se le pasan a la RPC. Van con la variante
  // para que la propia RPC verifique que la unidad pertenece a la línea:
  // el id de unidad viene del cliente y no se usa sin contrastar.
  const unidadesAVender: { unidad_id: string; variante_id: string }[] = [];

  for (const item of itemsResueltos) {
    const varianteId = item.varianteId;
    if (!varianteId) continue;

    const disponibles = disponiblesPorVariante.get(varianteId) ?? 0;
    if (disponibles === 0) continue;

    const unidadId = unidadPorVariante.get(varianteId);
    if (!unidadId) {
      return {
        error: `"${item.variante}" se vende por número de serie: elegí la unidad antes de confirmar.`,
        success: false,
      };
    }

    // Una unidad por línea. Vender dos aparatos del mismo modelo son dos
    // líneas, cada una con su IMEI — con una sola línea de cantidad 2 no
    // habría a qué unidad atar el segundo ventas_items, y la trazabilidad
    // por aparato es justamente el punto de todo esto.
    if (item.cantidad !== 1) {
      return {
        error: `"${item.variante}" se vende por número de serie: cargá una línea por aparato (cantidad 1).`,
        success: false,
      };
    }

    unidadesAVender.push({ unidad_id: unidadId, variante_id: varianteId });
  }

  /** Solo las unidades que realmente entran a la venta. `unidadPorVariante`
   * es lo que mandó el cliente y puede traer de más (una unidad para una
   * variante que no es serializada); esto es lo que se marca y lo que se
   * enlaza después en ventas_items. */
  const unidadesVendidasPorVariante = new Map(
    unidadesAVender.map((u) => [u.variante_id, u.unidad_id]),
  );

  let totalElegible = 0;
  itemsResueltos.forEach((item) => {
    const elegible =
      !promoData || promoData.tipo_regla !== "CATEGORIA"
        ? true
        : categoriasPromo.includes((item.tipo || "").toLowerCase());
    if (elegible) totalElegible += item.precioServer * item.cantidad;
  });

  // --- 1. VALIDAR STOCK Y PRORRATEAR DESCUENTOS ---
  const itemsProcesados = [];
  let totalVentaBrutaItems = 0;
  let costoTotalVenta = 0;

  for (const item of itemsResueltos) {
    const { productoIdReal, varianteId, stockActual } = item;
    const cantidadFinal = item.cantidad;
    const precioCostoReal = item.costoServer;
    const precioUnitario = item.precioServer;

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
      varianteId,
      cantidad: cantidadFinal,
      stockId: stockActual.id,
      stockOriginal: stockActual.cantidad,
      precioCosto: precioCostoReal,
      precioUnitario: precioUnitario,
      descuentoMonto: itemDescuentoMonto,
      precioFinal: itemPrecioFinal,
    });
  }

  // --- 1bis. TOTAL, PAGOS Y REGLAS DE CUENTA CORRIENTE ---
  // Se valida ACÁ, antes de tocar stock — así una venta rechazada por
  // pagos/entrega mínima nunca llega a descontar (ni necesita revertir)
  // stock atómico. Antes este bloque corría después del descuento de
  // stock, dejando la puerta abierta a decrementar stock real para una
  // venta que después se rechazaba por sumaPagos/monto.
  const { data: configVenta } = await supabase
    .from("configuracion_pos")
    .select(
      // Las 4 últimas son para el comprobante del paso 11. Viajan en esta
      // consulta y no en una propia: es la misma fila y ya la estamos trayendo.
      // `cc_plazo_mora` viaja acá y ya no en una consulta propia más abajo: es
      // la misma fila que esta consulta ya trae, y pedirla dos veces era un
      // round-trip entero por venta para leer una columna.
      "permitir_venta_sin_stock, cc_anticipo_default, entrega_minima_bloqueante, cc_recargo_default, cc_plazo_mora, modo_facturacion, comprobante_defecto, condicion_iva, punto_venta",
    )
    .single();
  const permitirVentaSinStock = configVenta?.permitir_venta_sin_stock ?? false;

  const configComprobante = configVenta
    ? {
        modo_facturacion: configVenta.modo_facturacion,
        comprobante_defecto: configVenta.comprobante_defecto,
        condicion_iva: configVenta.condicion_iva,
        punto_venta: configVenta.punto_venta,
      }
    : null;

  const subtotalConDescuento = Math.max(
    0,
    totalVentaBrutaItems - descuentoMonto,
  );

  // Recargo de cuenta corriente recalculado server-side desde
  // configuracion_pos. `recargo_cc` sigue llegando por formData pero YA NO se
  // usa para cobrar: se compara y se loguea, igual que el precio de los items.
  // Antes se confiaba en el número del cliente, así que un request modificado
  // podía fiar sin recargo (o inventarse uno) sobre plata real.
  const pctRecargoCC = Number(configVenta?.cc_recargo_default) || 0;
  const recargoCCServer =
    isCuentaCorriente && !ccSinRecargo
      ? (subtotalConDescuento * pctRecargoCC) / 100
      : 0;

  // Sin columna que lo registre, el log es el único rastro de que esta venta
  // se fió sin el recargo que la config exige. Va como error para que quede
  // en los logs de producción, no como info.
  if (isCuentaCorriente && ccSinRecargo && pctRecargoCC > 0) {
    console.error("[VENTA CC SIN RECARGO]", {
      vendedorId: user.id,
      clienteId,
      subtotal: subtotalConDescuento,
      pctRecargoCCOmitido: pctRecargoCC,
      recargoOmitido: (subtotalConDescuento * pctRecargoCC) / 100,
    });
  }

  const recargoCCCliente = isNaN(recargoCC) ? 0 : recargoCC;
  if (Math.abs(recargoCCCliente - recargoCCServer) > 0.05) {
    console.error("[VENTA RECARGO CC MISMATCH]", {
      vendedorId: user.id,
      clienteId,
      recargoCliente: recargoCCCliente,
      recargoServer: recargoCCServer,
    });
  }

  // Calculamos el Total Real del Ticket
  const totalConDescuentoYRecargo = subtotalConDescuento + recargoCCServer;

  // --- 2. VALIDACIÓN DEL ARRAY DE PAGOS ---
  const pagosRawArray: CreateSalePaymentInput[] = pagosRaw
    ? JSON.parse(pagosRaw)
    : [];
  const pagosValidos = pagosRawArray.filter((p) => Number(p.montoAsignado) > 0);

  // `montoAsignado` es la BASE: lo que ese cobro imputa al ticket. El recargo
  // por método se calcula acá, con los porcentajes leídos de la base — nunca
  // con lo que mande el cliente, mismo criterio que los precios de los items.
  // Por eso las validaciones de abajo siguen comparando bases contra el total
  // del ticket: el recargo no cubre mercadería, así que no puede "completar"
  // un pago que no alcanza.
  const recargoCalculado = calcularPagosConRecargo(pagosValidos, metodosDb);
  const sumaPagos = recargoCalculado.totalBase;
  const recargoMetodoTotal = recargoCalculado.totalRecargo;
  const totalConRecargoMetodo = totalConDescuentoYRecargo + recargoMetodoTotal;
  const montoCobradoReal = sumaPagos + recargoMetodoTotal;

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

  // --- 2ter. TOPE DE CLIENTES CON CUENTA CORRIENTE DEL PLAN ---
  //
  // El tope NO frena la venta, y es a propósito: una operación en curso no se
  // rompe por un límite comercial. Hasta acá esto devolvía error y la venta no
  // se hacía — con la clienta en el mostrador y la mercadería sobre el vidrio,
  // por un cupo de facturación. Perder esa venta es un daño mucho peor que
  // dejar pasar un cliente por encima del límite.
  //
  // El freno vive ahora en el alta MANUAL de deuda (trg_limite_cc_manual: un
  // DEBITO sin venta_id ni pago_id). Acá solo se registra el exceso para poder
  // verlo del lado de Comerz.
  if (isCuentaCorriente && montoPendiente > 0.05 && clienteId) {
    const { data: puedeFiar } = await supabase.rpc("puede_fiar", {
      p_cliente: clienteId,
    });

    if (puedeFiar === false) {
      console.warn(
        `[TOPE CUENTA CORRIENTE] Venta fiada por encima del cupo del plan (cliente ${clienteId}). Se completa igual: el tope no frena ventas.`,
      );
    }
  }

  // --- 2bis. VALIDAR ENTREGA MÍNIMA (CUENTA CORRIENTE) ---
  // Espejo server-side del chequeo de cart-panel-admin.tsx — ese es
  // client-side y trivialmente bypasseable llamando esta action directo.
  // Sin excepción de cliente y con el toggle bloqueante activo, la venta
  // se rechaza acá también.
  if (isCuentaCorriente && clienteId) {
    const pctEntregaMinima = Number(configVenta?.cc_anticipo_default) || 0;
    if (pctEntregaMinima > 0 && configVenta?.entrega_minima_bloqueante) {
      const { data: clienteCC } = await supabase
        .from("clientes")
        .select("exceptuado_entrega_minima")
        .eq("id", clienteId)
        .single();

      if (!clienteCC?.exceptuado_entrega_minima) {
        const entregaMinimaRequerida =
          (totalConDescuentoYRecargo * pctEntregaMinima) / 100;
        if (sumaPagos + 0.05 < entregaMinimaRequerida) {
          return {
            error: `Este cliente requiere al menos $${entregaMinimaRequerida.toLocaleString("es-AR")} de entrega para esta compra.`,
            success: false,
          };
        }
      }
    }
  }

  // --- 1ter. VALIDAR Y DESCONTAR STOCK (ATÓMICO) ---
  // La lectura del paso 0 (stockActual) puede estar desactualizada para
  // cuando llegamos a este punto (otra venta concurrente descontando la
  // misma variante); la única fuente de verdad sobre "hay stock
  // suficiente" es el UPDATE condicional en producto_variantes, atómico a
  // nivel de fila vía la función `ajustar_stock_variante`. Si algún item
  // no tiene stock suficiente, revertimos (sumamos de nuevo) lo que ya se
  // hubiera descontado de items anteriores en este mismo loop y no
  // creamos la venta — así no queda un ticket fantasma sin stock
  // descontado detrás.
  // --- 1bis. MARCAR LAS UNIDADES SERIALIZADAS (TODO O NADA) ---
  // Va ANTES de descontar stock y antes de crear la venta, a propósito: es
  // el paso que puede rechazar la operación por "ese aparato ya se vendió",
  // y esa decisión tiene que tomarse antes de cualquier escritura derivada.
  //
  // El id de la venta se genera acá y se usa después como PK explícita de
  // `ventas`. Eso permite atar las unidades a la venta antes de que la
  // cabecera exista; funciona porque unidades_serie.venta_id NO tiene FK
  // dura (decisión de la migración: la trazabilidad del aparato tiene que
  // sobrevivir a que la venta desaparezca). Si algún paso posterior falla,
  // `revertir_unidades_serie` las libera.
  //
  // La RPC hace UPDATE ... WHERE id = ? AND estado = 'disponible' y aborta
  // si no afecta exactamente la cantidad pedida: dos cajas vendiendo el
  // mismo IMEI a la vez se serializan en el row lock y la segunda rebota.
  const ventaId = crypto.randomUUID();

  if (unidadesAVender.length > 0) {
    const { error: unidadesError } = await supabase.rpc(
      "vender_unidades_serie",
      { p_venta_id: ventaId, p_unidades: unidadesAVender },
    );

    if (unidadesError) {
      console.error("[VENTA] Error marcando unidades serie:", unidadesError);
      const yaVendida = unidadesError.message?.includes(
        "UNIDADES_NO_DISPONIBLES",
      );
      return {
        error: yaVendida
          ? "Alguna de las unidades seleccionadas ya fue vendida. Volvé a elegir el aparato."
          : "No se pudieron reservar las unidades con número de serie.",
        success: false,
      };
    }
  }

  /** Libera las unidades de ESTA venta. Se llama cuando un paso posterior
   * falla y la venta no va a existir. */
  const liberarUnidades = async () => {
    if (unidadesAVender.length === 0) return;
    const { error } = await supabase.rpc("revertir_unidades_serie", {
      p_venta_id: ventaId,
    });
    if (error) {
      // Grave y silencioso si no se deja rastro: las unidades quedarían
      // marcadas como vendidas de una venta que nunca existió.
      console.error(
        "[VENTA] CRÍTICO: no se pudieron liberar las unidades de la venta abortada",
        { ventaId, unidades: unidadesAVender, error },
      );
    }
  };

  const itemsConStockDescontado: typeof itemsProcesados = [];

  /** Devuelve el stock que este mismo request ya había descontado. */
  const revertirStockDescontado = async () => {
    for (const previo of itemsConStockDescontado) {
      if (!previo.varianteId) continue;
      await supabase.rpc("ajustar_stock_variante", {
        p_variante_id: previo.varianteId,
        p_delta: previo.cantidad,
      });
    }
  };

  for (const item of itemsProcesados) {
    if (!item.varianteId) {
      // Producto legacy sin producto_variantes: no hay fila atómica que
      // descontar acá, productos_stock es su única fuente de stock y se
      // sigue tocando más abajo, igual que siempre.
      itemsConStockDescontado.push(item);
      continue;
    }

    const { data: descontado, error: descuentoError } = await supabase.rpc(
      "ajustar_stock_variante",
      {
        p_variante_id: item.varianteId,
        p_delta: -item.cantidad,
        p_permitir_negativo: permitirVentaSinStock,
      },
    );

    if (descuentoError) {
      console.error("[VENTA] Error descontando stock:", descuentoError);
      await revertirStockDescontado();
      await liberarUnidades();
      return {
        error: `Error al descontar stock de "${item.variante}".`,
        success: false,
      };
    }

    if (!descontado || descontado.length === 0) {
      await revertirStockDescontado();
      await liberarUnidades();
      return {
        error: `Sin stock suficiente para la variante "${item.variante}".`,
        success: false,
      };
    }

    itemsConStockDescontado.push(item);
  }

  // --- 3. CÁLCULO FINANCIERO MASIVO ---
  let comisionTotalGeneral = 0;
  let totalNetoGeneral = 0;
  const ventaPagosPayloads = [];

  for (const pago of recargoCalculado.pagos) {
    const metodoData = metodosMap[pago.metodoPagoId];
    if (!metodoData) {
      // Este return ya dejaba el stock descontado antes de este cambio; ahora
      // que además hay unidades marcadas, se revierten las dos cosas para no
      // dejar aparatos "vendidos" en una venta que no se creó.
      await revertirStockDescontado();
      await liberarUnidades();
      return { error: "Método de pago inválido.", success: false };
    }

    // El bruto es base + recargo: es la plata que efectivamente pasa por el
    // posnet, y por eso la comisión del procesador se calcula sobre ÉL y no
    // sobre la base. Si se calculara sobre la base, el neto quedaría inflado
    // justo en los métodos con recargo, que son los que más comisión tienen.
    const montoBruto = pago.montoBruto;
    const comisionPorcentaje = Number(metodoData.comision || 0);
    const comisionMonto = (montoBruto * comisionPorcentaje) / 100;
    const montoNeto = montoBruto - comisionMonto;

    comisionTotalGeneral += comisionMonto;
    totalNetoGeneral += montoNeto;

    ventaPagosPayloads.push({
      metodo_pago_id: metodoData.id,
      metodo_nombre: metodoData.nombre,
      metodo_tipo: metodoData.tipo,
      monto_base: pago.montoBase,
      recargo_porcentaje: pago.recargoPorcentaje,
      recargo_monto: pago.recargoMonto,
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
    // PK explícita: es el mismo id con el que ya se marcaron las unidades
    // serializadas más arriba. Sin esto no habría forma de atar el aparato
    // a la venta antes de que la venta exista.
    id: ventaId,
    vendedor_id: user.id,
    cliente_id: clienteId || null,
    turno_caja_id: turnoAbiertoId,
    estado_operacion: "CONFIRMADA",
    metodo_pago: metodoPagoSafe,
    // `total` incluye el recargo por método: es lo que el cliente paga y lo
    // que tiene que cerrar contra monto_cobrado. La deuda de cuenta corriente
    // (monto_pendiente) sigue calculándose sobre bases, así que el recargo de
    // la entrega no le baja la deuda al cliente ni se la sube.
    total: totalConRecargoMetodo,
    precio_costo: isNaN(costoTotalVenta) ? 0 : costoTotalVenta,
    cantidad: items.length,
    total_bruto: totalConRecargoMetodo,
    recargo_metodo_total: recargoMetodoTotal,
    comision_total: comisionTotalGeneral,
    total_neto: totalNetoGeneral,
    es_pago_mixto: pagosValidos.length > 1,
    monto_cobrado: montoCobradoReal,
    monto_pendiente: montoPendiente > 0 ? montoPendiente : 0,
    estado_pago: estadoPago,
  };

  // --- 4. ESCRIBIR LA VENTA ENTERA, EN UNA TRANSACCIÓN ---
  //
  // Cabecera, pagos, renglones, descuento, deuda de cuenta corriente, espejo
  // legacy de stock y reservas van juntos en la RPC `registrar_venta`. Antes
  // eran seis escrituras sueltas y cualquiera podía fallar dejando hechas a las
  // anteriores: el caso peor era el insert de pagos, que devolvía error sin
  // revertir nada y dejaba una venta CONFIRMADA sin un solo pago — arqueo que
  // no cierra y mercadería fuera del inventario.
  //
  // Lo que queda afuera de la transacción es el stock y las unidades
  // serializadas, que ya son atómicos por su cuenta. Si la RPC falla, se
  // revierten los dos acá: es el mismo camino que usan todos los cortes de
  // arriba, y ahora no queda ningún punto entre medio.
  const insertItems = itemsProcesados.map((item) => ({
    producto_id: item.productoId,
    variante: item.variante,
    // Cierra la cadena venta > ventas_items > unidad_serie > variante.
    // Se lee de `unidadesVendidasPorVariante`, no del payload del cliente:
    // solo se enlaza la unidad que la RPC efectivamente marcó como vendida.
    // NULL en todo lo no serializado, que es el caso normal.
    unidad_serie_id: item.varianteId
      ? (unidadesVendidasPorVariante.get(item.varianteId) ?? null)
      : null,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    precio_costo: item.precioCosto,
    descuento_monto: item.descuentoMonto,
    precio_final: item.precioFinal,
    promocion_id: promoData && item.descuentoMonto > 0 ? promocionId : null,
    promocion_nombre:
      promoData && item.descuentoMonto > 0 ? promoData.nombre : null,
  }));

  // El espejo legacy va por DELTA (cuánto restarle), no con el valor final: el
  // valor que se mandaba antes salía de una lectura hecha al principio de la
  // venta y dos cajas concurrentes escribían las dos sobre la misma foto.
  const stockLegacy = itemsProcesados.map((item) => ({
    stock_id: item.stockId,
    cantidad: item.cantidad,
  }));

  const ticketCorto = ventaId.split("-")[0].toUpperCase();

  const { data: resultadoVenta, error: ventaError } = await supabase.rpc(
    "registrar_venta",
    {
      p_venta: payloadVentas,
      p_pagos: ventaPagosPayloads,
      p_items: insertItems,
      p_stock_legacy: stockLegacy,
      p_descuento:
        promoData && promocionId && promocionId !== "ninguna" && descuentoMonto > 0
          ? {
              promocion_id: promocionId,
              promocion_nombre: promoData.nombre,
              tipo_descuento: promoData.tipo_descuento,
              monto_descontado: descuentoMonto,
            }
          : null,
      p_cc:
        isCuentaCorriente && clienteId
          ? {
              cliente_id: clienteId,
              monto_pendiente: montoPendiente,
              plazo_mora: Number(configVenta?.cc_plazo_mora ?? 30),
              descripcion: `Compra Fiada - Ticket #${ticketCorto}`,
            }
          : null,
      p_reserva_ids: reservaIds,
    },
  );

  if (ventaError || !resultadoVenta) {
    // Nada de la venta quedó escrito: la transacción entera se deshizo. Solo
    // hay que devolver lo que se hizo ANTES de ella.
    console.error("[VENTA] Error registrando la venta:", ventaError);
    await revertirStockDescontado();
    await liberarUnidades();

    // `VENTA_SIN_RENGLONES` es el freno de la RPC contra una venta cobrada sin
    // saber qué se vendió. No debería pasar nunca; si pasa, el mensaje tiene
    // que decirle a la vendedora que puede reintentar sin miedo, porque no
    // quedó nada a medias.
    const sinRenglones = ventaError?.message?.includes("VENTA_SIN_RENGLONES");
    return {
      error: sinRenglones
        ? "No se pudo registrar el detalle de la venta. No se cobró nada ni se descontó stock: volvé a intentar."
        : `Fallo en BD: ${ventaError?.message}`,
      success: false,
    };
  }

  const nuevaVenta = resultadoVenta as {
    venta_id: string;
    fecha_venta: string;
    fecha_vencimiento: string | null;
  };

  // --- 11. EMITIR EL COMPROBANTE ---
  // Va último y NO puede voltear la venta: a esta altura la plata ya se cobró
  // y el stock ya se descontó. Ver el comentario largo en emitir-comprobante.ts
  // — con TICKET interno, dejar la venta sin comprobante es menos grave que
  // hacer rebotar una venta que ya ocurrió en el mostrador. Cuando ARCA emita
  // de verdad esto se invierte: el CAE hay que pedirlo ANTES de cerrar.
  //
  // Los datos del receptor se leen recién acá y se copian a la fila: el
  // comprobante los congela, así que no se puede depender de un join contra
  // `clientes` que mañana devuelva otra cosa.
  let receptor = null;
  if (clienteId) {
    const { data: clienteFiscal } = await supabase
      .from("clientes")
      .select("nombre, razon_social, cuit, condicion_iva")
      .eq("id", clienteId)
      .maybeSingle();

    receptor = {
      cliente_id: clienteId,
      // La razón social es el dato fiscal; el nombre de fantasía es el
      // fallback para que el comprobante no salga sin receptor cuando el
      // cliente existe pero nunca cargó sus datos de facturación.
      receptor_razon_social:
        clienteFiscal?.razon_social || clienteFiscal?.nombre || null,
      receptor_cuit: clienteFiscal?.cuit ?? null,
      receptor_condicion_iva: clienteFiscal?.condicion_iva ?? null,
    };
  }

  const comprobante = await emitirComprobante(supabase, {
    ventaId: nuevaVenta.venta_id,
    config: configComprobante,
    receptor,
    // El mismo número que `ventas.total`, recargos incluidos: si difirieran,
    // el comprobante diría una cosa y el ticket otra.
    total: totalConRecargoMetodo,
    emitidoPor: user.id,
  });

  revalidatePath("/", "layout");
  return {
    error: null,
    success: true,
    ventaId: nuevaVenta.venta_id,
    // Viaja al POS para imprimirlo en el ticket sin una consulta extra. Va
    // null si la emisión falló: el ticket cae al identificador de la venta,
    // que es lo que mostraba antes de que existieran los comprobantes.
    comprobante: comprobante.ok
      ? {
          tipo: comprobante.tipo,
          puntoVenta: comprobante.puntoVenta,
          numero: comprobante.numero,
        }
      : null,
  };
}
