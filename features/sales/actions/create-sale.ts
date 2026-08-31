"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CreateSalePaymentInput } from "@/entities/ventas/types";
import { resolverTurnoActivo } from "@/entities/caja/lib/resolve-turno-activo";
import { calcularPagosConRecargo } from "@/shared/lib/recargo-metodo";
import {
  esFraccionable,
  normalizarCantidadVendible,
  redondearCantidad,
} from "@/shared/lib/unidad-venta";
import { emitirComprobante } from "../lib/emitir-comprobante";
import { ARCA_EMISION_DISPONIBLE } from "@/shared/lib/facturacion";

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

  // --- VENTA OFFLINE ---
  //
  // El POS puede cobrar sin señal y mandar la venta después (ver
  // `features/sales/lib/outbox-ventas.ts`). Eso trae tres datos que en una
  // venta normal no existen:
  //
  // `venta_id`: lo pone el CLIENTE. Es la clave de idempotencia — si la
  // respuesta se pierde y la venta se reenvía, `registrar_venta` la reconoce
  // por su PK y devuelve `ya_registrada` en vez de cobrarla dos veces.
  // Se valida el formato: lo que va a una columna uuid no puede venir crudo.
  //
  // `vendida_en`: la hora REAL del cobro. Sin ella la venta quedaría fechada
  // cuando se sincronizó, o sea en el turno equivocado y con la curva
  // horaria corrida.
  //
  // `offline`: la venta NO revalida precios (ver el paso 0). Es la única
  // excepción a la regla de no confiar en el precio del cliente, y existe
  // porque el ticket que se le dio a la clienta dice ese número: cambiarlo
  // al sincronizar sería cobrar una cosa y registrar otra.
  const esVentaOffline = formData.get("offline") === "true";
  const ventaIdCliente = (formData.get("venta_id") as string | null)?.trim();
  const vendidaEn = (formData.get("vendida_en") as string | null)?.trim();

  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (ventaIdCliente && !UUID_V4.test(ventaIdCliente)) {
    return { error: "Identificador de venta inválido.", success: false };
  }

  // Una factura no se puede emitir sin conexión: el CAE lo da ARCA en el
  // momento. Mientras la emisión fiscal esté apagada esto no se activa —
  // todo sale como TICKET interno, que sí se puede numerar al sincronizar—,
  // pero el día que se prenda, una venta offline no puede colarse y quedar
  // sin comprobante válido. El freno va acá, antes de tocar nada.
  if (esVentaOffline && ARCA_EMISION_DISPONIBLE) {
    return {
      error: "Sin conexión no se puede facturar: el CAE lo autoriza ARCA en el momento.",
      success: false,
    };
  }

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

  // La configuración del comercio, UNA vez por venta.
  //
  // Antes se leía dos veces la MISMA fila: acá adentro de `resolverTurnoActivo`
  // y otra vez más abajo para las columnas de pagos y comprobante. Medido en
  // la traza de una venta real, ese duplicado era un round-trip entero.
  const { data: configVenta } = await supabase
    .from("configuracion_pos")
    .select(
      // `modo_caja` y `requiere_caja_abierta` son para el turno; el resto para
      // los pagos y para el comprobante del paso 11. Misma fila, una consulta.
      "modo_caja, requiere_caja_abierta, permitir_venta_sin_stock, cc_anticipo_default, entrega_minima_bloqueante, cc_recargo_default, cc_plazo_mora, modo_facturacion, comprobante_defecto, condicion_iva, punto_venta",
    )
    .single();

  // --- PREÁMBULO DE LA VENTA, EN PARALELO ---
  //
  // Cuatro cosas que la venta necesita y que NO dependen entre sí: el turno de
  // caja, los métodos de pago, la promoción aplicada y los precios/costos
  // reales del carrito. Antes se pedían una atrás de otra, así que eran cuatro
  // viajes SERIALES a Ohio antes de tocar una sola fila. Ahora es uno solo:
  // ninguna de las cuatro necesita el resultado de las otras.
  //
  // Lo único que queda antes es `configVenta`, porque el turno sí depende de
  // ella (`modo_caja` y `requiere_caja_abierta`).
  //
  // Los precios se resuelven SERVER-SIDE: item.precio / item.precioUnitario
  // vienen del cliente y son solo para pintar el carrito antes de confirmar.
  // El precio (y el costo, que define el margen reportado) que efectivamente
  // se cobra y persiste sale siempre de la variante o, si esta no tiene su
  // propio valor, del producto — nunca del payload del cliente. Y son DOS
  // consultas para todo el carrito, no dos por renglón: antes era un `for` con
  // dos `await` adentro, o sea 20 viajes en un ticket de 10 renglones. Mismo
  // criterio que `aprobar_orden_compra` e `importar_productos_planilla`.
  const productoIds = [
    ...new Set(items.map((item) => item.productoId ?? item.id)),
  ];

  /** La promoción y, si es por categoría, las categorías que alcanza. Va como
   * función para poder entrar al mismo `Promise.all` que el resto. */
  const cargarPromocion = async () => {
    if (!promocionId || promocionId === "ninguna" || descuentoMonto <= 0) {
      return { promoData: null, categoriasPromo: [] as string[] };
    }

    const { data: promo } = await supabase
      .from("promociones")
      .select("*")
      .eq("id", promocionId)
      .single();

    if (!promo) return { promoData: null, categoriasPromo: [] as string[] };
    if (promo.tipo_regla !== "CATEGORIA") {
      return { promoData: promo, categoriasPromo: [] as string[] };
    }

    const { data: cats } = await supabase
      .from("promociones_categorias")
      .select("categoria_nombre")
      .eq("promocion_id", promocionId);

    return {
      promoData: promo,
      categoriasPromo: (cats ?? []).map((c) =>
        c.categoria_nombre.toLowerCase(),
      ),
    };
  };

  const [
    { turnoId: turnoAbiertoId, requiereCajaAbierta: requiereCaja },
    { data: metodosDb },
    { promoData, categoriasPromo },
    { data: stockFilas },
    { data: variantesFilas },
  ] = await Promise.all([
    resolverTurnoActivo(supabase, user.id, configVenta),
    // Columnas explícitas y no `*`: es la fila que arma cada pago del ticket,
    // y traer el resto solo engorda la respuesta.
    supabase
      .from("metodos_pago")
      .select(
        "id, nombre, tipo, comision, recargo_porcentaje, acreditacion_dias",
      ),
    cargarPromocion(),
    supabase
      .from("productos_stock")
      // `unidad_medida` viaja acá y no en una consulta propia: es la misma
      // fila que ya estamos trayendo. Decide si este producto se puede vender
      // fraccionado (0,750 kg) o solo de a enteros.
      .select(
        "cantidad, id, producto_id, variante, producto:productos(precio, precio_costo, unidad_medida)",
      )
      .in("producto_id", productoIds),
    supabase
      .from("producto_variantes")
      .select("id, precio, costo, producto_id, nombre_display")
      .in("producto_id", productoIds),
  ]);

  // BLOQUEO Y ASIGNACIÓN DE CAJA (MODO DINÁMICO)
  if (requiereCaja && !turnoAbiertoId) {
    return { error: "CAJA_CERRADA", success: false };
  }

  if (!metodosDb)
    return { error: "Error consultando métodos de pago.", success: false };
  const metodosMap = Object.fromEntries(metodosDb.map((m) => [m.id, m]));

  // La clave compuesta reproduce el `.eq().eq()` que hacía cada iteración.
  const stockPorClave = new Map(
    (stockFilas ?? []).map((fila) => [
      `${fila.producto_id}|${fila.variante}`,
      fila,
    ]),
  );
  const variantePorId = new Map((variantesFilas ?? []).map((v) => [v.id, v]));
  const variantePorNombre = new Map(
    (variantesFilas ?? []).map((v) => [`${v.producto_id}|${v.nombre_display}`, v]),
  );

  const itemsResueltos = [];
  for (const item of items) {
    const productoIdReal = item.productoId ?? item.id;

    const stockActual = stockPorClave.get(`${productoIdReal}|${item.variante}`);

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
    //
    // Al batchear, las variantes se traen POR PRODUCTO, así que un varianteId
    // que no pertenece a este producto ya no matchea. Antes se buscaba por PK
    // suelta y se usaba su precio sin comprobar de qué producto era: un
    // carrito manipulado podía traer el id de una variante barata de otro
    // producto. Ahora eso cae al precio del producto, que es server-side.
    const varianteData =
      (item.varianteId ? variantePorId.get(item.varianteId) : null) ??
      variantePorNombre.get(`${productoIdReal}|${item.variante}`) ??
      null;

    if (!varianteData) {
      console.warn("[VENTA VARIANTE SIN MATCH]", {
        vendedorId: user.id,
        productoId: productoIdReal,
        variante: item.variante,
        varianteIdDelCarrito: item.varianteId ?? null,
      });
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
        offline: esVentaOffline,
      });
    }

    // ACÁ está la única excepción a la regla de que el precio lo pone el
    // server. En una venta offline el precio que vale es el que la clienta
    // ya pagó: el ticket impreso dice ese número, y registrar otro sería
    // cobrar una cosa y guardar otra. El costo, en cambio, sigue saliendo de
    // la base: no lo paga nadie en el mostrador, y tomarlo del cliente
    // dejaría el margen a merced de un request modificado.
    //
    // Lo que se aparta del precio vigente NO se pierde: se acumula y queda
    // en `ventas.desfasaje_precio`. Aceptar el precio del cliente sin
    // registrar la diferencia sería un agujero silencioso.
    const precioUsado = esVentaOffline ? precioCliente : precioServer;

    // La cantidad se valida server-side por el mismo motivo que el precio: la
    // manda el cliente. Hasta acá era `Number(item.cantidad ?? 1)` sin
    // chequear nada, y eso dejaba pasar una cantidad NEGATIVA — que no es un
    // error de tipeo sino un request modificado: más abajo se descuenta con
    // `p_delta: -item.cantidad`, así que en negativo AGREGA stock y baja el
    // total del ticket.
    //
    // Con la cantidad decimal el chequeo además tiene que saber QUÉ producto
    // es: 0,750 es una venta válida de fiambre y una imposible de remeras.
    const unidadMedida = productoData?.unidad_medida;
    const cantidadValidada = normalizarCantidadVendible(
      item.cantidad ?? 1,
      unidadMedida,
    );

    if (cantidadValidada === null) {
      console.error("[VENTA CANTIDAD INVALIDA]", {
        vendedorId: user.id,
        productoId: productoIdReal,
        variante: item.variante,
        cantidadRecibida: item.cantidad,
        unidadMedida,
      });
      return {
        error: esFraccionable(unidadMedida)
          ? `Cantidad inválida para "${item.variante}".`
          : `"${item.variante}" se vende por unidad: la cantidad tiene que ser un número entero.`,
        success: false,
      };
    }

    itemsResueltos.push({
      productoIdReal,
      variante: item.variante,
      varianteId: item.varianteId ?? varianteData?.id ?? null,
      tipo: item.tipo,
      cantidad: cantidadValidada,
      stockActual,
      precioServer: precioUsado,
      // Cuánto se apartó del precio vigente, por unidad. Cero en toda venta
      // online, donde `precioUsado` ES el del server.
      desfasajeUnitario: precioUsado - precioServer,
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
  // Cuánto se apartó del precio vigente TODA la venta. Siempre 0 online.
  let desfasajePrecioVenta = 0;

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
    desfasajePrecioVenta += item.desfasajeUnitario * cantidadFinal;

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
  // `configVenta` ya se trajo arriba, junto con lo del turno: es la misma fila
  // y antes se pedía dos veces en la misma venta.
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

  // El porcentaje que efectivamente rigió para ESTA venta, que es lo que se
  // guarda en `ventas.recargo_cc_porcentaje`. Con el flag de la vendedora
  // prendido es 0, y ese 0 es un dato: dice que se fió sin recargo, distinto
  // de null, que dice que no se sabe.
  const pctRecargoCCAplicado =
    isCuentaCorriente && !ccSinRecargo ? pctRecargoCC : 0;

  // El log sigue, pero ya no es el único rastro: desde 20260823180630 la
  // venta guarda el porcentaje aplicado y el monto, así que fiar sin recargo
  // se puede contar, no solo encontrar leyendo logs.
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
  // El id lo pone el cliente cuando la venta se cobró offline; si no, lo
  // ponemos acá como siempre. En los dos casos es la PK, y por lo tanto el
  // freno contra registrar la misma venta dos veces.
  const ventaId = ventaIdCliente ?? crypto.randomUUID();

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

  /** Los renglones que mueven stock por variante. Un producto legacy sin
   * `producto_variantes` no tiene fila atómica que descontar: su stock vive
   * solo en el espejo `productos_stock`, que se toca más abajo. */
  const itemsConVariante = itemsProcesados.filter((item) => item.varianteId);

  /** Los movimientos tal como los espera la RPC. La misma variante en dos
   * renglones viaja dos veces y la función los SUMA (agrupa por variante):
   * mandarlos ya sumados desde acá sería una segunda implementación de la
   * misma regla, en el lugar donde no la protege ninguna transacción. */
  const movimientosStock = itemsConVariante.map((item) => ({
    variante_id: item.varianteId,
    delta: -item.cantidad,
  }));

  let stockDescontado = false;

  /** Devuelve el stock que este mismo request ya había descontado. */
  const revertirStockDescontado = async () => {
    if (!stockDescontado) return;

    const { error } = await supabase.rpc("ajustar_stock_variantes", {
      p_movimientos: movimientosStock.map((movimiento) => ({
        ...movimiento,
        delta: -movimiento.delta,
      })),
      // Una devolución NUNCA se frena por el signo: la mercadería vuelve
      // igual, y dejarla sin devolver es peor que un stock negativo, que al
      // menos se ve y se corrige.
      p_permitir_negativo: true,
      // REVERSO_VENTA y no ANULACION_VENTA: la venta nunca llegó a existir.
      // Es el movimiento que la reconstrucción vieja de movimientos no podía
      // ver, porque no deja fila en ninguna otra tabla.
      p_origen: "REVERSO_VENTA",
      p_referencia_id: ventaId,
    });

    if (error) {
      console.error(
        "[VENTA] CRÍTICO: no se pudo devolver el stock de la venta abortada",
        { ventaId, movimientos: movimientosStock, error },
      );
      return;
    }

    stockDescontado = false;
  };

  /** Los nombres que la RPC no puede saber: la excepción viaja con los ids de
   * las variantes que no llegaron, y acá se traducen a lo que la vendedora ve
   * escrito en el ticket. */
  const nombresSinStock = (detalle: string | null | undefined): string[] => {
    if (!detalle) return [];
    try {
      const ids = JSON.parse(detalle);
      if (!Array.isArray(ids)) return [];
      return ids
        .map(
          (id) =>
            itemsConVariante.find((item) => item.varianteId === id)?.variante,
        )
        .filter((nombre): nombre is string => Boolean(nombre));
    } catch {
      return [];
    }
  };

  // --- 2. DESCUENTO DE STOCK: TODO EL TICKET EN UN VIAJE ---
  //
  // Antes era un `for` con un `await` adentro, o sea un round-trip por
  // renglón, en fila y con la clienta esperando. Además, si el renglón 4 no
  // tenía mercadería, los 3 primeros YA estaban descontados y había que
  // devolverlos con otros 3 viajes. La RPC plural es todo-o-nada: o descuenta
  // el ticket entero o no toca una sola fila, así que acá ya no hay nada que
  // revertir cuando falla el descuento.
  if (movimientosStock.length > 0) {
    const { error: descuentoError } = await supabase.rpc(
      "ajustar_stock_variantes",
      {
        p_movimientos: movimientosStock,
        p_permitir_negativo: permitirVentaSinStock,
        // El origen viaja CON la llamada y no se setea antes: `set_config` es
        // transaction-local y cada RPC es su propia transacción, así que un
        // "marcar origen" previo desde acá no llegaría.
        p_origen: "VENTA",
        p_referencia_id: ventaId,
      },
    );

    if (descuentoError) {
      await liberarUnidades();

      if (descuentoError.message?.includes("STOCK_INSUFICIENTE")) {
        const faltantes = nombresSinStock(descuentoError.details);
        return {
          error: faltantes.length
            ? `Sin stock suficiente para la variante "${faltantes.join('", "')}".`
            : "Sin stock suficiente para completar la venta.",
          success: false,
        };
      }

      console.error("[VENTA] Error descontando stock:", descuentoError);
      return { error: "Error al descontar stock.", success: false };
    }

    stockDescontado = true;
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
    // Costo TOTAL de la venta (ya viene multiplicado por las cantidades de
    // cada renglón), no unitario. Ver el comentario de `cantidad` acá abajo.
    precio_costo: isNaN(costoTotalVenta) ? 0 : costoTotalVenta,
    // UNIDADES vendidas, no renglones. Guardaba `items.length`, así que vender
    // 3 remeras iguales en una línea contaba 1: el gráfico del panel, la
    // columna "Unidades" de la exportación al contador y el detalle de ventas
    // venían subcontando. Las 226 ventas históricas de más de un renglón
    // quedaron corregidas en la migración 20260816170000.
    // Redondeado a 3 decimales antes de mandarlo: sumar decimales en binario
    // deja colas (0,1 + 0,2 = 0,30000000000000004). La columna es
    // numeric(12,3) y lo redondearía igual, pero mandar el número limpio evita
    // que el valor que se loguea difiera del que se guarda.
    cantidad: redondearCantidad(
      itemsProcesados.reduce((acc, item) => acc + item.cantidad, 0),
    ),
    total_bruto: totalConRecargoMetodo,
    recargo_metodo_total: recargoMetodoTotal,
    comision_total: comisionTotalGeneral,
    total_neto: totalNetoGeneral,
    es_pago_mixto: pagosValidos.length > 1,
    monto_cobrado: montoCobradoReal,
    monto_pendiente: montoPendiente > 0 ? montoPendiente : 0,
    estado_pago: estadoPago,
    // Recargo por fiar, congelado en la fila. Antes se sumaba a `total` y
    // desaparecía: no había forma de saber cuánto de un ticket fiado era
    // mercadería y cuánto era el precio de esperar, y por lo tanto tampoco de
    // comparar fiar contra cobrar con tarjeta. Va SIEMPRE, 0 incluido — un
    // null en la columna significa "venta anterior a esto", no "sin recargo".
    recargo_cc_porcentaje: pctRecargoCCAplicado,
    recargo_cc_monto: recargoCCServer,
    // La hora del COBRO, no la de la sincronización: una venta offline que
    // sube 40 minutos después caería en el turno equivocado y correría la
    // curva horaria de los reportes. Sin dato, la RPC usa now().
    fecha_venta: vendidaEn || null,
    registrada_offline: esVentaOffline,
    // Redondeado al peso: es un número para mirar, no para cuadrar contra
    // otro. Null en las ventas online, donde la pregunta no aplica.
    desfasaje_precio: esVentaOffline ? Math.round(desfasajePrecioVenta) : null,
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
    // La variante vendida, congelada en el renglón. Es por acá que la
    // anulación devuelve el stock con `ajustar_stock_variante`; sin esto cae al
    // match por `nombre_display`, que falla en silencio cuando el talle se
    // renombró después de la venta.
    variante_id: item.varianteId,
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
    ya_registrada?: boolean;
  };

  // LA VENTA YA ESTABA. Pasa cuando el intento anterior llegó al server y
  // lo que se perdió fue la respuesta: el celular reintenta con el MISMO id
  // y `registrar_venta` lo reconoce por la PK.
  //
  // No es un error y no hay que rehacer nada. Pero sí hay que DESHACER lo
  // que este intento alcanzó a hacer antes de la RPC: el stock ya se
  // descontó una vez (en el intento que sí quedó) y este segundo descuento
  // sobra. Sin esto, cada reintento se comería el stock de nuevo, en
  // silencio y sin que la venta lo explique.
  if (nuevaVenta.ya_registrada) {
    await revertirStockDescontado();
    await liberarUnidades();

    console.info("[VENTA] Reintento de una venta que ya estaba registrada", {
      ventaId,
      offline: esVentaOffline,
    });

    // El número de comprobante sale de la fila que ya existe: el ticket
    // impreso en el mostrador tiene que poder repetirse igual.
    const { data: comprobanteExistente } = await supabase
      .from("comprobantes")
      .select("punto_venta, numero")
      .eq("venta_id", ventaId)
      .maybeSingle();

    return {
      error: null,
      success: true,
      ventaId,
      yaRegistrada: true,
      comprobante: comprobanteExistente
        ? {
            puntoVenta: comprobanteExistente.punto_venta,
            numero: comprobanteExistente.numero,
          }
        : null,
    };
  }

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
