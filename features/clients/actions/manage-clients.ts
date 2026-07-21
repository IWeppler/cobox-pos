"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseClientesCSV } from "@/features/clients/lib/parse-clientes-csv";
import {
  calcularRecargoMoraTotal,
  RecargoMoraConfig,
} from "@/features/clients/lib/calcular-saldo-con-recargo";
import { calcularFechaVencimiento } from "@/features/clients/lib/calcular-fecha-vencimiento";

interface ClientActionState {
  error: string | null;
  success: boolean;
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

  // C. Cálculos de comisión para la caja
  const comisionPorcentaje = Number(metodo.comision || 0);
  const comisionMonto = (monto * comisionPorcentaje) / 100;
  const montoNeto = monto - comisionMonto;

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
      monto_bruto: monto,
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
  const descripcionPago =
    montoRecargoAplicado > 0
      ? `Pago a cuenta - ${metodo.nombre} (incluye $${montoRecargoAplicado.toLocaleString("es-AR")} de recargo por mora)`
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
) {
  const nombre = formData.get("nombre") as string;
  const telefono = formData.get("whatsapp") as string;
  const notas = formData.get("notas") as string;
  const dni = formData.get("dni") as string;
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

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("clientes").insert({
    nombre,
    telefono,
    dni: dni || null,
    notas: notas || null,
    activo: true,
    exceptuado_entrega_minima: exceptuadoEntregaMinima,
    fecha_vencimiento_deuda: fechaVencimientoDeuda,
  });

  if (error) {
    console.error("Error creando cliente:", error);
    return { error: "No se pudo crear el cliente.", success: false };
  }

  revalidatePath("/clientes");
  return { error: null, success: true };
}

// 5. EDITAR CLIENTE
export async function editClienteAction(clienteId: string, formData: FormData) {
  const nombre = formData.get("nombre") as string;
  const telefono =
    (formData.get("telefono") as string | null) ||
    (formData.get("whatsapp") as string | null) ||
    "";
  const dni = formData.get("dni") as string;
  const email = formData.get("email") as string;
  const notas = formData.get("notas") as string;
  const fechaVencimientoDeuda =
    (formData.get("fecha_vencimiento_deuda") as string) || null;
  // El checkbox solo se renderiza (y por lo tanto solo viaja en el
  // FormData) cuando la entrega mínima está activa a nivel negocio. Sin
  // este marcador, un guardado con la feature apagada pisaría en silencio
  // la excepción ya guardada de un cliente con `false`.
  const exceptuadoEditable =
    formData.get("exceptuado_entrega_minima_editable") === "1";

  if (!nombre || !clienteId) {
    return { error: "El nombre es obligatorio.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const updatePayload: Record<string, unknown> = {
    nombre,
    telefono,
    dni: dni || null,
    email: email || null,
    notas: notas || null,
    fecha_vencimiento_deuda: fechaVencimientoDeuda,
  };
  if (exceptuadoEditable) {
    updatePayload.exceptuado_entrega_minima =
      formData.get("exceptuado_entrega_minima") === "on";
  }

  const { error } = await supabase
    .from("clientes")
    .update(updatePayload)
    .eq("id", clienteId);

  if (error)
    return { error: "Error al actualizar el cliente.", success: false };

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

  await supabase
    .from("clientes")
    .update({
      saldo_pendiente: saldoActual + montoTotal,
      fecha_vencimiento_deuda: fechaVencimientoFinal,
    })
    .eq("id", clienteId);

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

    for (const candidato of parsed.clientes) {
      const { nombre, telefono, dni, deudaInicial, fechaVencimientoDeuda } =
        candidato;

      // Insertamos el cliente
      const { data: nuevoCliente, error: errCli } = await supabase
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

    return { error: null, success: true, count: importados };
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

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  return { esAdmin: perfil?.rol === "ADMIN", userId: user.id };
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
