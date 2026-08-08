"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { calcularRecargoMonto } from "@/shared/lib/recargo-metodo";
import { parseClientesCSV } from "@/features/clients/lib/parse-clientes-csv";
import {
  calcularRecargoMoraTotal,
  RecargoMoraConfig,
} from "@/features/clients/lib/calcular-saldo-con-recargo";
import { calcularFechaVencimiento } from "@/features/clients/lib/calcular-fecha-vencimiento";
import { esCuitValido, normalizarCuit } from "@/shared/lib/cuit";

interface ClientActionState {
  error: string | null;
  success: boolean;
}

/**
 * Datos fiscales listos para guardar, o el error que hay que mostrar.
 *
 * Vive acá y lo comparten alta y edición porque tenían la validación
 * duplicada y ya habían empezado a divergir. Dos reglas:
 *
 *  - Si el cliente NO es fiscal, todo lo fiscal va a null. Es lo que ya hacían
 *    las dos actions; queda explícito para que se vea que es a propósito
 *    (apagar el toggle borra los datos fiscales) y no un olvido.
 *  - El CUIT se valida por dígito verificador. Es la validación que se puede
 *    hacer sin ARCA y atrapa el error real: un número mal tipeado. Se guarda
 *    normalizado (solo dígitos) para que "30-712..." y "30712..." no entren
 *    como dos clientes distintos y el índice único sirva de algo.
 */
function resolverDatosFiscales(formData: FormData):
  | { error: string; datos?: undefined }
  | { error?: undefined; datos: Record<string, string | null> } {
  const esFiscal = formData.get("es_fiscal") === "true";
  const texto = (clave: string) =>
    ((formData.get(clave) as string | null) ?? "").trim() || null;

  if (!esFiscal) {
    return {
      datos: {
        cuit: null,
        razon_social: null,
        condicion_iva: null,
        direccion: null,
        localidad: null,
        provincia: null,
        codigo_postal: null,
      },
    };
  }

  const cuit = normalizarCuit(formData.get("cuit"));
  const razonSocial = texto("razon_social");
  const condicionIva = texto("condicion_iva");

  if (!cuit || !razonSocial || !condicionIva) {
    return {
      error:
        "El CUIT, la Razón Social y la Condición de IVA son obligatorios para clientes fiscales.",
    };
  }

  if (!esCuitValido(cuit)) {
    return {
      error:
        "El CUIT no es válido: revisá los números. Tiene que tener 11 dígitos y el dígito verificador correcto.",
    };
  }

  return {
    datos: {
      cuit,
      razon_social: razonSocial,
      condicion_iva: condicionIva,
      direccion: texto("direccion"),
      localidad: texto("localidad"),
      provincia: texto("provincia"),
      codigo_postal: texto("codigo_postal"),
    },
  };
}

/** Lo mínimo que necesita el selector del POS para dejar el cliente elegido. */
export interface ClienteCreado {
  id: string;
  nombre: string;
  telefono: string | null;
  exceptuado_entrega_minima: boolean;
}

export interface CrearClienteState extends ClientActionState {
  cliente?: ClienteCreado;
}

// 1. OBTENER TODOS LOS CLIENTES (Para la tabla principal)
export async function getClientesAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("clientes")
    .select(
      `
      *,
      ventas ( id, total )
    `,
    )
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error fetching clientes:", error);
    return { data: null, error: "No se pudieron cargar los clientes." };
  }

  return { data, error: null };
}

// Combina clientes + métodos de pago + config de CC/mora para el listado
// en un solo fetch client-side (React Query cachea esto con staleTime de 3 min).
export async function getClientesPageDataAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [clientesRes, metodosRes, configRes] = await Promise.all([
    getClientesAction(),
    supabase.from("metodos_pago").select("*").eq("activo", true),
    supabase
      .from("configuracion_pos")
      .select("cc_anticipo_default, recargo_mora_tipo, recargo_mora_valor")
      .single(),
  ]);

  if (clientesRes.error) {
    return { data: null, error: clientesRes.error };
  }

  const recargoMoraConfig: RecargoMoraConfig = {
    recargo_mora_tipo: configRes.data?.recargo_mora_tipo ?? "NINGUNO",
    recargo_mora_valor: configRes.data?.recargo_mora_valor ?? 0,
  };

  return {
    data: {
      clientes: clientesRes.data ?? [],
      metodosPago: metodosRes.data ?? [],
      entregaMinimaActiva: (configRes.data?.cc_anticipo_default ?? 0) > 0,
      recargoMoraConfig,
    },
    error: null,
  };
}

// 2. OBTENER DETALLE PROFUNDO (Para el Sheet lateral)
export async function getClienteDetalleAction(clienteId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [movimientosRes, ventasRes, reservasRes] = await Promise.all([
    supabase
      .from("cuenta_corriente_movimientos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("creado_en", { ascending: false }),
    supabase
      .from("ventas")
      .select(
        "id, total, cliente_id, clientes(nombre), monto_cobrado, monto_pendiente, estado_pago, fecha_venta, fecha_vencimiento, ventas_items(cantidad, producto:productos(nombre, tipo)), venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)",
      )
      .eq("cliente_id", clienteId)
      .order("fecha_venta", { ascending: false }),
    supabase
      .from("reservas")
      .select(
        "id, nota, estado, creado_en, producto:productos(nombre), variante:producto_variantes(nombre_display, precio)",
      )
      .eq("cliente_id", clienteId)
      .order("creado_en", { ascending: false }),
  ]);

  return {
    movimientos: movimientosRes.data || [],
    ventas: ventasRes.data || [],
    reservas: reservasRes.data || [],
  };
}

// 3. REGISTRAR PAGO DE DEUDA
export async function registrarPagoDeudaAction(
  prevState: ClientActionState | null,
  formData: FormData,
) {
  const clienteId = formData.get("cliente_id") as string;
  const metodoPagoId = formData.get("metodo_pago_id") as string;
  const montoRaw = formData.get("monto") as string;
  const monto = Number(montoRaw);

  if (!clienteId || !metodoPagoId || isNaN(monto) || monto <= 0) {
    return { error: "Datos inválidos para registrar el pago.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autorizado.", success: false };

  // 🚀 A. Buscar si el usuario tiene una caja abierta donde meter la plata
  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("modo_caja")
    .single();
  const modoCaja = config?.modo_caja || "UNICA";

  let query = supabase.from("turnos_caja").select("id").eq("estado", "ABIERTO");
  if (modoCaja === "UNICA") query = query.eq("modo", "UNICA");
  else query = query.eq("modo", "POR_USUARIO").eq("usuario_id", user.id);

  const { data: turno } = await query.maybeSingle();

  if (!turno) {
    return {
      error: "Caja cerrada. Debes abrir un turno para ingresar este dinero.",
      success: false,
    };
  }

  // B. Buscar el método de pago
  const { data: metodo } = await supabase
    .from("metodos_pago")
    .select("*")
    .eq("id", metodoPagoId)
    .single();

  if (!metodo)
    return { error: "Método de pago no encontrado.", success: false };

  // C. Recargo por método + comisión.
  //
  // `monto` es la BASE: lo que el cliente amortiza de su deuda. El recargo se
  // le suma encima (paga más, debe lo mismo de menos), así pagar fiado con
  // tarjeta no le sale más barato que haber pagado con tarjeta en el momento.
  // Se recalcula server-side desde metodos_pago, nunca desde el formulario —
  // mismo criterio que el recargo por mora de acá abajo y que los precios de
  // create-sale.ts.
  const recargoPorcentaje = Number(metodo.recargo_porcentaje || 0);
  const recargoMetodoMonto = calcularRecargoMonto(monto, recargoPorcentaje);
  const montoBruto = monto + recargoMetodoMonto;

  // La comisión del procesador se calcula sobre el bruto: es lo que pasa por
  // el posnet, recargo incluido.
  const comisionPorcentaje = Number(metodo.comision || 0);
  const comisionMonto = (montoBruto * comisionPorcentaje) / 100;
  const montoNeto = montoBruto - comisionMonto;

  // C-bis. Recargo por mora — recalculado server-side, nunca confiar en
  // lo que mande el cliente (mismo criterio que create-sale.ts con
  // precios). "Recargo primero": si el monto cobrado no alcanza a cubrir
  // base + recargo estimado, el recargo se salda antes que el capital.
  const [{ data: configPos }, { data: ventasVencidas }] = await Promise.all([
    supabase
      .from("configuracion_pos")
      .select("recargo_mora_tipo, recargo_mora_valor")
      .single(),
    supabase
      .from("ventas")
      .select("monto_pendiente, fecha_vencimiento")
      .eq("cliente_id", clienteId)
      .gt("monto_pendiente", 0),
  ]);
  const recargoConfig: RecargoMoraConfig = {
    recargo_mora_tipo: configPos?.recargo_mora_tipo ?? "NINGUNO",
    recargo_mora_valor: configPos?.recargo_mora_valor ?? 0,
  };
  const { totalRecargo } = calcularRecargoMoraTotal(
    ventasVencidas ?? [],
    recargoConfig,
  );
  const montoRecargoAplicado = Math.min(monto, totalRecargo);

  // D. Iniciar Transacción Manual
  // 1. Guardar en venta_pagos (Para que impacte en el Cierre Z de Caja)
  const { data: pagoRegistrado, error: pagoError } = await supabase
    .from("venta_pagos")
    .insert({
      cliente_id: clienteId,
      turno_caja_id: turno.id, // 🚀 FIX: Ahora sí se vincula a la caja
      metodo_pago_id: metodo.id,
      metodo_nombre: metodo.nombre,
      metodo_tipo: metodo.tipo,
      monto_base: monto,
      recargo_porcentaje: recargoPorcentaje,
      recargo_monto: recargoMetodoMonto,
      monto_bruto: montoBruto,
      comision_porcentaje: comisionPorcentaje,
      comision_monto: comisionMonto,
      monto_neto: montoNeto,
      acreditacion_dias: metodo.acreditacion_dias,
      tipo_movimiento: "PAGO_CUENTA_CORRIENTE",
    })
    .select("id")
    .single();

  if (pagoError || !pagoRegistrado)
    return { error: "Error al registrar pago en caja.", success: false };

  // 2. Guardar en el Ledger de la Cuenta Corriente (Para que baje la deuda)
  //
  // El movimiento va por la BASE, no por el bruto: el recargo por método es
  // plata del cobro, no capital amortizado. Si fuera por el bruto, la deuda
  // bajaría más de lo que el cliente realmente pagó a cuenta.
  const detallesPago = [
    montoRecargoAplicado > 0
      ? `$${montoRecargoAplicado.toLocaleString("es-AR")} de recargo por mora`
      : null,
    recargoMetodoMonto > 0
      ? `$${recargoMetodoMonto.toLocaleString("es-AR")} de recargo por ${metodo.nombre}`
      : null,
  ].filter(Boolean);

  const descripcionPago =
    detallesPago.length > 0
      ? `Pago a cuenta - ${metodo.nombre} (incluye ${detallesPago.join(" y ")})`
      : `Pago a cuenta - ${metodo.nombre}`;

  const { error: ccError } = await supabase
    .from("cuenta_corriente_movimientos")
    .insert({
      cliente_id: clienteId,
      pago_id: pagoRegistrado.id,
      tipo: "CREDITO",
      monto: monto,
      monto_recargo: montoRecargoAplicado,
      descripcion: descripcionPago,
      creado_por: user.id,
    });

  if (ccError)
    return { error: "Error al registrar movimiento en CC.", success: false };

  // 3. Actualizar el caché de deuda en el Cliente
  const { data: clienteActual } = await supabase
    .from("clientes")
    .select("saldo_pendiente")
    .eq("id", clienteId)
    .single();
  const saldoActual = Number(clienteActual?.saldo_pendiente || 0);

  await supabase
    .from("clientes")
    .update({ saldo_pendiente: Math.max(0, saldoActual - monto) })
    .eq("id", clienteId);

  revalidatePath("/clientes");
  revalidatePath("/caja");

  return { error: null, success: true };
}

// 4. CREAR CLIENTE NUEVO
export async function crearClienteAction(
  prevState: ClientActionState | null,
  formData: FormData,
): Promise<CrearClienteState> {
  // Datos comerciales básicos
  const nombre = formData.get("nombre") as string;
  const telefono = formData.get("whatsapp") as string;
  const email = formData.get("email") as string;
  const dni = formData.get("dni") as string;
  const notas = formData.get("notas") as string;
  // Dirección de contacto/entrega: existe para cualquier cliente, tenga o no
  // datos fiscales. Es distinta del domicilio fiscal, que va en la factura.
  const direccionComercial =
    ((formData.get("direccion_comercial") as string | null) ?? "").trim() ||
    null;

  // Datos operativos
  const fechaVencimientoDeuda =
    (formData.get("fecha_vencimiento_deuda") as string) || null;
  const exceptuadoEntregaMinima =
    formData.get("exceptuado_entrega_minima") === "on";

  if (!nombre || !telefono) {
    return {
      error: "El nombre y el teléfono son obligatorios.",
      success: false,
    };
  }

  const fiscal = resolverDatosFiscales(formData);
  if (fiscal.error) {
    return { error: fiscal.error, success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({
      nombre,
      telefono,
      email: email || null,
      dni: dni || null,
      notas: notas || null,
      direccion_comercial: direccionComercial,
      activo: true,
      exceptuado_entrega_minima: exceptuadoEntregaMinima,
      fecha_vencimiento_deuda: fechaVencimientoDeuda,
      ...fiscal.datos,
    })
    // El POS necesita el cliente recién creado para dejarlo seleccionado en el
    // ticket sin volver a consultar la lista entera.
    .select("id, nombre, telefono, exceptuado_entrega_minima")
    .single();

  if (error || !cliente) {
    console.error("Error creando cliente:", error);
    // 23505 = DNI/CUIT repetido. El resto se resume: el detalle queda en el log.
    if (error?.code === "23505") {
      return {
        error: "Ya existe un cliente con ese DNI o CUIT.",
        success: false,
      };
    }
    return { error: "No se pudo crear el cliente.", success: false };
  }

  revalidatePath("/clientes");
  return { error: null, success: true, cliente: cliente as ClienteCreado };
}

// 5. EDITAR CLIENTE
export async function editClienteAction(clienteId: string, formData: FormData) {
  // Datos comerciales básicos
  const nombre = formData.get("nombre") as string;
  const telefono =
    (formData.get("telefono") as string | null) ||
    (formData.get("whatsapp") as string | null) ||
    "";
  const dni = formData.get("dni") as string;
  const email = formData.get("email") as string;
  const notas = formData.get("notas") as string;
  const direccionComercial =
    ((formData.get("direccion_comercial") as string | null) ?? "").trim() ||
    null;

  // Datos operativos
  const fechaVencimientoDeuda =
    (formData.get("fecha_vencimiento_deuda") as string) || null;
  const exceptuadoEditable =
    formData.get("exceptuado_entrega_minima_editable") === "1";

  if (!nombre || !clienteId) {
    return { error: "El nombre es obligatorio.", success: false };
  }

  const fiscal = resolverDatosFiscales(formData);
  if (fiscal.error) {
    return { error: fiscal.error, success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const updatePayload: Record<string, unknown> = {
    nombre,
    telefono,
    dni: dni || null,
    email: email || null,
    notas: notas || null,
    direccion_comercial: direccionComercial,
    fecha_vencimiento_deuda: fechaVencimientoDeuda,
    ...fiscal.datos,
  };

  if (exceptuadoEditable) {
    updatePayload.exceptuado_entrega_minima =
      formData.get("exceptuado_entrega_minima") === "on";
  }

  const { error } = await supabase
    .from("clientes")
    .update(updatePayload)
    .eq("id", clienteId);

  if (error) {
    console.error("Error actualizando cliente:", error);
    // 23505 = choque con clientes_negocio_cuit_unico_idx / _dni_unico_idx.
    // El alta ya lo traducía; la edición no, y desde que los índices existen
    // también puede chocar (editar un cliente para ponerle el CUIT de otro).
    if (error.code === "23505") {
      return {
        error: "Ya existe otro cliente con ese DNI o CUIT.",
        success: false,
      };
    }
    return { error: "Error al actualizar el cliente.", success: false };
  }

  revalidatePath("/clientes");
  return { error: null, success: true };
}

// 6. AJUSTE MANUAL DE SALDO / DEUDA INICIAL (múltiples entradas históricas)
export interface EntradaSaldoInicial {
  fecha: string; // "YYYY-MM-DD"
  monto: number;
  nota?: string;
}

function formatearFechaCorta(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** "YYYY-MM-DD" de hoy en hora local — mismo criterio que el resto de la
 * validación de fechas de deuda (columnas `date`, sin componente horario). */
function fechaHoyIso(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

export async function ajustarSaldoAction(
  clienteId: string,
  entradas: EntradaSaldoInicial[],
) {
  if (!clienteId || !Array.isArray(entradas) || entradas.length === 0) {
    return { error: "Cargá al menos una fecha con su monto.", success: false };
  }

  // Validación server-side de cada entrada — nunca confiar en los montos ni
  // las fechas que manda el cliente, mismo criterio que create-sale.ts.
  const hoyIso = fechaHoyIso();
  const entradasValidas: { fecha: string; monto: number; nota: string }[] = [];

  for (const entrada of entradas) {
    const monto = Number(entrada.monto);
    const fecha = String(entrada.fecha || "");

    if (isNaN(monto) || monto <= 0) {
      return {
        error: "Hay un monto inválido en la lista de fechas.",
        success: false,
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return {
        error: "Hay una fecha inválida en la lista.",
        success: false,
      };
    }
    if (fecha > hoyIso) {
      return {
        error: "No se pueden cargar fechas futuras.",
        success: false,
      };
    }

    entradasValidas.push({ fecha, monto, nota: (entrada.nota || "").trim() });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const montoTotal = entradasValidas.reduce((acc, e) => acc + e.monto, 0);

  // 1. Un movimiento en el Ledger POR ENTRADA — no uno fusionado — para que
  // el historial refleje el desglose por fecha que cargó la dueña, cada
  // uno con su propia nota y su fecha_origen real (creado_en sigue siendo
  // "cuándo se registró en el sistema", no se falsifica).
  const movimientos = entradasValidas.map((entrada) => ({
    cliente_id: clienteId,
    tipo: "DEBITO" as const,
    monto: entrada.monto,
    fecha_origen: entrada.fecha,
    descripcion: entrada.nota
      ? `Saldo inicial (deuda del ${formatearFechaCorta(entrada.fecha)}): ${entrada.nota}`
      : `Saldo inicial (deuda del ${formatearFechaCorta(entrada.fecha)})`,
    creado_por: user?.id,
  }));

  const { error: ccError } = await supabase
    .from("cuenta_corriente_movimientos")
    .insert(movimientos);

  if (ccError)
    return { error: "Error al registrar los movimientos.", success: false };

  // 2. Saldo y vencimiento del cliente
  const [{ data: cliente }, { data: configPos }] = await Promise.all([
    supabase
      .from("clientes")
      .select("saldo_pendiente, fecha_vencimiento_deuda")
      .eq("id", clienteId)
      .single(),
    supabase.from("configuracion_pos").select("cc_plazo_mora").single(),
  ]);

  const saldoActual = Number(cliente?.saldo_pendiente || 0);
  const plazoMora = configPos?.cc_plazo_mora ?? 30;

  // Vencimiento: desde la entrada más antigua + plazo de mora, pero sin
  // pisar un vencimiento existente que ya sea más próximo (más urgente) —
  // el cliente puede ya tener una deuda vigente por otra vía.
  const fechaMasAntigua = entradasValidas.reduce(
    (min, e) => (e.fecha < min ? e.fecha : min),
    entradasValidas[0].fecha,
  );
  const nuevoVencimiento = calcularFechaVencimiento(fechaMasAntigua, plazoMora);
  const vencimientoActual = cliente?.fecha_vencimiento_deuda ?? null;
  const fechaVencimientoFinal =
    vencimientoActual && vencimientoActual < nuevoVencimiento
      ? vencimientoActual
      : nuevoVencimiento;

  const { error: errorSaldo } = await supabase
    .from("clientes")
    .update({
      saldo_pendiente: saldoActual + montoTotal,
      fecha_vencimiento_deuda: fechaVencimientoFinal,
    })
    .eq("id", clienteId);

  if (errorSaldo) {
    // 23514 = tope de clientes con cuenta corriente del plan. El mensaje del
    // trigger ya viene redactado para el comerciante: se pasa tal cual.
    if (errorSaldo.code === "23514") {
      return { error: errorSaldo.message, success: false };
    }
    console.error("[REGISTRAR DEUDA ERROR]", errorSaldo);
    return { error: "No se pudo registrar la deuda.", success: false };
  }

  revalidatePath("/clientes");
  return { error: null, success: true };
}

// 7. IMPORTACIÓN MASIVA DESDE CSV
export async function importarClientesCSVAction(formData: FormData) {
  try {
    const csvText = formData.get("csv_text") as string;
    let text = "";

    // Obtenemos el texto seguro desde la UI
    if (csvText) {
      text = csvText;
    } else {
      const file = formData.get("file") as File;
      if (!file || file.size === 0)
        return { error: "No se subió ningún archivo.", success: false };
      text = await file.text();
    }

    const parsed = parseClientesCSV(text);
    if (parsed.error) {
      return { error: parsed.error, success: false };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let importados = 0;
    // Los que entraron pero sin su deuda inicial, por el tope del plan.
    let importadosSinDeuda = 0;

    for (const candidato of parsed.clientes) {
      const { nombre, telefono, dni, deudaInicial, fechaVencimientoDeuda } =
        candidato;

      // Insertamos el cliente
      let { data: nuevoCliente, error: errCli } = await supabase
        .from("clientes")
        .insert({
          nombre,
          telefono,
          dni: dni || null,
          saldo_pendiente: deudaInicial > 0 ? deudaInicial : 0,
          activo: true,
          fecha_vencimiento_deuda: fechaVencimientoDeuda,
        })
        .select("id")
        .single();

      // 23514 = se llegó al tope de cuenta corriente del plan. El cliente
      // igual entra, pero sin la deuda inicial: perder el contacto entero por
      // un límite de facturación sería peor que importarlo en cero.
      if (errCli?.code === "23514" && deudaInicial > 0) {
        console.warn(
          `[IMPORTAR CLIENTES] "${nombre}" se importa sin su deuda inicial: ${errCli.message}`,
        );
        ({ data: nuevoCliente, error: errCli } = await supabase
          .from("clientes")
          .insert({
            nombre,
            telefono,
            dni: dni || null,
            saldo_pendiente: 0,
            activo: true,
          })
          .select("id")
          .single());

        if (!errCli) {
          importadosSinDeuda++;
          continue;
        }
      }

      if (errCli) {
        console.error(`Error insertando cliente ${nombre}:`, errCli.message);
        continue;
      }

      // Si el cliente se creó bien y traía deuda, le anotamos el registro en su cuenta corriente
      if (nuevoCliente && deudaInicial > 0) {
        const { error: errCc } = await supabase
          .from("cuenta_corriente_movimientos")
          .insert({
            cliente_id: nuevoCliente.id,
            tipo: "DEBITO",
            monto: deudaInicial,
            descripcion: "Saldo inicial importado (CSV)",
            creado_por: user?.id,
          });
        if (errCc) {
          console.error(`Error creando Ledger para ${nombre}:`, errCc.message);
        }
      }

      importados++;
    }

    revalidatePath("/clientes");

    if (importados === 0 && parsed.totalFilas > 0) {
      const debug = parsed.debug;
      console.error(
        `[importarClientesCSVAction] 0 importados. separator=${JSON.stringify(debug?.separator)} idxNombre=${debug?.idxNombre} headers=${JSON.stringify(debug?.headers)} primeras líneas crudas: ${debug?.headerPreview}`,
      );
      return {
        error: `No se importó ningún cliente. Revisa el registro de errores en la consola (ej. DNI duplicados o campos faltantes). Separador detectado: ${JSON.stringify(debug?.separator)}. Primeras líneas: ${debug?.headerPreview}`,
        success: false,
        count: 0,
      };
    }

    return {
      error: null,
      success: true,
      count: importados + importadosSinDeuda,
      sinDeuda: importadosSinDeuda,
    };
  } catch (error) {
    console.error("Error importando CSV:", error);
    return { error: "Error procesando el archivo CSV.", success: false };
  }
}

// 8. EDITAR / ANULAR MOVIMIENTO MANUAL DE CUENTA CORRIENTE (saldo inicial /
// ajuste manual, sea cargado a mano o por CSV — ambos insertan sin
// venta_id ni pago_id). Movimientos generados por una venta o un cobro NO
// pasan por acá — ese es el discriminador, y ambas actions lo verifican
// server-side además de la UI, por si algún día alguien llama esto directo.

async function esUsuarioAdmin(
  supabase: ReturnType<typeof createClient>,
): Promise<{ esAdmin: boolean; userId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { esAdmin: false, userId: null };

  // is_admin() ya resuelve el rol dentro del negocio activo.
  const { data: esAdmin } = await supabase.rpc("is_admin");

  return { esAdmin: esAdmin === true, userId: user.id };
}

/**
 * Recalcula clientes.fecha_vencimiento_deuda DESDE CERO, tomando la fecha
 * más antigua entre todos los movimientos manuales no anulados de ese
 * cliente + cc_plazo_mora (null si no queda ninguno). A diferencia de
 * ajustarSaldoAction (que solo compara contra el valor existente y nunca
 * lo hace menos urgente), acá el recálculo reemplaza el valor sin
 * comparar — una corrección tiene que poder mover el vencimiento en
 * cualquier dirección, es la parte que arregla una fecha mal cargada.
 */
async function recalcularVencimientoDesdeMovimientosManuales(
  supabase: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<string | null> {
  const [{ data: movimientos }, { data: configPos }] = await Promise.all([
    supabase
      .from("cuenta_corriente_movimientos")
      .select("fecha_origen, creado_en")
      .eq("cliente_id", clienteId)
      .is("venta_id", null)
      .is("pago_id", null)
      .eq("anulado", false),
    supabase.from("configuracion_pos").select("cc_plazo_mora").single(),
  ]);

  if (!movimientos || movimientos.length === 0) return null;

  const plazoMora = configPos?.cc_plazo_mora ?? 30;
  const fechaMasAntigua = movimientos.reduce((min: string, mov) => {
    const fecha = mov.fecha_origen || String(mov.creado_en).slice(0, 10);
    return !min || fecha < min ? fecha : min;
  }, "");

  return calcularFechaVencimiento(fechaMasAntigua, plazoMora);
}

export async function editarMovimientoManualAction(
  movimientoId: string,
  datos: { fecha: string; monto: number; nota?: string },
) {
  if (!movimientoId) {
    return { error: "Movimiento inválido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { esAdmin } = await esUsuarioAdmin(supabase);
  if (!esAdmin) {
    return {
      error: "Solo un administrador puede editar movimientos.",
      success: false,
    };
  }

  // Validación server-side — misma regla que la carga original, nunca
  // confiar en lo que manda el cliente.
  const monto = Number(datos.monto);
  const fecha = String(datos.fecha || "");
  if (isNaN(monto) || monto <= 0) {
    return { error: "El monto tiene que ser mayor a $0.", success: false };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { error: "Fecha inválida.", success: false };
  }
  if (fecha > fechaHoyIso()) {
    return { error: "No se pueden cargar fechas futuras.", success: false };
  }

  const { data: movimiento } = await supabase
    .from("cuenta_corriente_movimientos")
    .select("id, cliente_id, venta_id, pago_id, tipo, monto, anulado")
    .eq("id", movimientoId)
    .single();

  if (!movimiento) {
    return { error: "Movimiento no encontrado.", success: false };
  }
  if (movimiento.venta_id || movimiento.pago_id) {
    return {
      error:
        "Este movimiento viene de una venta o un cobro y no se puede editar acá.",
      success: false,
    };
  }
  if (movimiento.anulado) {
    return { error: "Este movimiento está anulado.", success: false };
  }

  const nota = (datos.nota || "").trim();
  const descripcion = nota
    ? `Saldo inicial (deuda del ${formatearFechaCorta(fecha)}): ${nota}`
    : `Saldo inicial (deuda del ${formatearFechaCorta(fecha)})`;

  const { error: updateError } = await supabase
    .from("cuenta_corriente_movimientos")
    .update({ monto, fecha_origen: fecha, descripcion })
    .eq("id", movimientoId);

  if (updateError) {
    return { error: "No se pudo actualizar el movimiento.", success: false };
  }

  // Delta sobre el saldo — nunca se reescribe el total a mano, para no
  // perder de vista otros movimientos concurrentes.
  const montoAnterior = Number(movimiento.monto);
  const signo = movimiento.tipo === "DEBITO" ? 1 : -1;
  const delta = signo * (monto - montoAnterior);

  const { data: cliente } = await supabase
    .from("clientes")
    .select("saldo_pendiente")
    .eq("id", movimiento.cliente_id)
    .single();
  const saldoActual = Number(cliente?.saldo_pendiente || 0);

  const nuevaFechaVencimiento =
    await recalcularVencimientoDesdeMovimientosManuales(
      supabase,
      movimiento.cliente_id,
    );

  await supabase
    .from("clientes")
    .update({
      saldo_pendiente: Math.max(0, saldoActual + delta),
      fecha_vencimiento_deuda: nuevaFechaVencimiento,
    })
    .eq("id", movimiento.cliente_id);

  revalidatePath("/clientes");
  return { error: null, success: true };
}

export async function anularMovimientoManualAction(movimientoId: string) {
  if (!movimientoId) {
    return { error: "Movimiento inválido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { esAdmin, userId } = await esUsuarioAdmin(supabase);
  if (!esAdmin) {
    return {
      error: "Solo un administrador puede anular movimientos.",
      success: false,
    };
  }

  const { data: movimiento } = await supabase
    .from("cuenta_corriente_movimientos")
    .select("id, cliente_id, venta_id, pago_id, tipo, monto, anulado")
    .eq("id", movimientoId)
    .single();

  if (!movimiento) {
    return { error: "Movimiento no encontrado.", success: false };
  }
  if (movimiento.venta_id || movimiento.pago_id) {
    return {
      error:
        "Este movimiento viene de una venta o un cobro y no se puede anular acá.",
      success: false,
    };
  }
  if (movimiento.anulado) {
    return { error: "Este movimiento ya está anulado.", success: false };
  }

  const { error: updateError } = await supabase
    .from("cuenta_corriente_movimientos")
    .update({
      anulado: true,
      anulado_en: new Date().toISOString(),
      anulado_por: userId,
    })
    .eq("id", movimientoId);

  if (updateError) {
    return { error: "No se pudo anular el movimiento.", success: false };
  }

  // Reversa del saldo — un DEBITO anulado resta, un CREDITO anulado suma
  // (hoy solo existen DEBITO en este flujo, pero se mantiene genérico).
  const signo = movimiento.tipo === "DEBITO" ? -1 : 1;
  const delta = signo * Number(movimiento.monto);

  const { data: cliente } = await supabase
    .from("clientes")
    .select("saldo_pendiente")
    .eq("id", movimiento.cliente_id)
    .single();
  const saldoActual = Number(cliente?.saldo_pendiente || 0);

  const nuevaFechaVencimiento =
    await recalcularVencimientoDesdeMovimientosManuales(
      supabase,
      movimiento.cliente_id,
    );

  await supabase
    .from("clientes")
    .update({
      saldo_pendiente: Math.max(0, saldoActual + delta),
      fecha_vencimiento_deuda: nuevaFechaVencimiento,
    })
    .eq("id", movimiento.cliente_id);

  revalidatePath("/clientes");
  return { error: null, success: true };
}
