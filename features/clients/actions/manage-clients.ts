"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

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
      ventas ( id, total, fecha_venta )
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

  const [movimientosRes, ventasRes] = await Promise.all([
    supabase
      .from("cuenta_corriente_movimientos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("creado_en", { ascending: false }),
    supabase
      .from("ventas")
      .select(
        "id, total, cliente_id, clientes(nombre), monto_cobrado, monto_pendiente, estado_pago, fecha_venta, ventas_items(cantidad, producto:productos(nombre, tipo)), venta_pagos(metodo_nombre, metodo_tipo, monto_bruto, comision_monto, monto_neto, acreditacion_dias, tipo_movimiento)",
      )
      .eq("cliente_id", clienteId)
      .order("fecha_venta", { ascending: false }),
  ]);

  return {
    movimientos: movimientosRes.data || [],
    ventas: ventasRes.data || [],
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

  // A. Buscar el método de pago
  const { data: metodo } = await supabase
    .from("metodos_pago")
    .select("*")
    .eq("id", metodoPagoId)
    .single();

  if (!metodo)
    return { error: "Método de pago no encontrado.", success: false };

  // B. Cálculos de comisión para la caja
  const comisionPorcentaje = Number(metodo.comision || 0);
  const comisionMonto = (monto * comisionPorcentaje) / 100;
  const montoNeto = monto - comisionMonto;

  // C. Iniciar Transacción Manual simulada
  // 1. Guardar en venta_pagos (Para que impacte en el Cierre Z de Caja)
  const { data: pagoRegistrado, error: pagoError } = await supabase
    .from("venta_pagos")
    .insert({
      cliente_id: clienteId,
      metodo_pago_id: metodo.id,
      metodo_nombre: metodo.nombre,
      metodo_tipo: metodo.tipo,
      monto_bruto: monto,
      comision_porcentaje: comisionPorcentaje,
      comision_monto: comisionMonto,
      monto_neto: montoNeto,
      acreditacion_dias: metodo.acreditacion_dias,
      tipo_movimiento: "PAGO_CUENTA_CORRIENTE", // <-- Diferenciador clave
    })
    .select("id")
    .single();

  if (pagoError || !pagoRegistrado)
    return { error: "Error al registrar pago en caja.", success: false };

  // 2. Guardar en el Ledger de la Cuenta Corriente (Para que baje la deuda)
  const { error: ccError } = await supabase
    .from("cuenta_corriente_movimientos")
    .insert({
      cliente_id: clienteId,
      pago_id: pagoRegistrado.id,
      tipo: "CREDITO",
      monto: monto,
      descripcion: `Pago a cuenta - ${metodo.nombre}`,
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
    .update({ saldo_pendiente: Math.max(0, saldoActual - monto) }) // Evitamos que quede en negativo si paga de más
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

  if (!nombre || !clienteId) {
    return { error: "El nombre es obligatorio.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("clientes")
    .update({
      nombre,
      telefono,
      dni: dni || null,
      email: email || null,
      notas: notas || null,
    })
    .eq("id", clienteId);

  if (error)
    return { error: "Error al actualizar el cliente.", success: false };

  revalidatePath("/clientes");
  return { error: null, success: true };
}

// 6. AJUSTE MANUAL DE SALDO / DEUDA INICIAL
export async function ajustarSaldoAction(
  clienteId: string,
  formData: FormData,
) {
  const monto = Number(formData.get("monto"));
  const descripcion = formData.get("descripcion") as string;

  if (isNaN(monto) || monto <= 0 || !clienteId) {
    return { error: "Monto inválido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Insertamos en el Ledger (Aumenta la deuda)
  const { error: ccError } = await supabase
    .from("cuenta_corriente_movimientos")
    .insert({
      cliente_id: clienteId,
      tipo: "DEBITO",
      monto: monto,
      descripcion: descripcion || "Ajuste manual / Saldo inicial",
      creado_por: user?.id,
    });

  if (ccError)
    return { error: "Error al registrar el movimiento.", success: false };

  // 2. Actualizamos la caché del cliente
  const { data: cliente } = await supabase
    .from("clientes")
    .select("saldo_pendiente")
    .eq("id", clienteId)
    .single();
  const saldoActual = Number(cliente?.saldo_pendiente || 0);

  await supabase
    .from("clientes")
    .update({ saldo_pendiente: saldoActual + monto })
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

    // 1. Limpiar marcas de formato raras (\uFEFF) y quitar líneas vacías
    const cleanText = text.replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/).filter((line) => line.trim() !== "");

    if (lines.length < 2)
      return {
        error: "El archivo está vacío o no tiene el formato válido.",
        success: false,
      };

    // 2. 🚀 Búsqueda inteligente de Cabeceras
    // Ignoramos filas vacías al inicio y buscamos dónde arranca la palabra 'nombre'
    let headerIdx = -1;
    let separator = ",";

    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      if (lowerLine.includes("nombre")) {
        headerIdx = i;
        // Detectar si Google Sheets exportó con coma o punto y coma
        separator = lines[i].includes(";") ? ";" : ",";
        break;
      }
    }

    if (headerIdx === -1) {
      return {
        error: "No se encontró la columna 'nombre' en el archivo.",
        success: false,
      };
    }

    const rows = lines.slice(headerIdx).map((line) => line.split(separator));
    const headers = rows[0].map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^["']|["']$/g, ""),
    );

    // Tolerancia a nombres similares de columnas
    const idxNombre = headers.findIndex(
      (h) => h === "nombre" || h === "cliente",
    );
    const idxTel = headers.findIndex(
      (h) => h === "telefono" || h === "telefono" || h === "tel",
    );
    const idxDni = headers.findIndex((h) => h === "dni" || h === "documento");
    const idxDeuda = headers.findIndex(
      (h) => h === "deuda_inicial" || h === "deuda" || h === "saldo",
    );

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let importados = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length <= idxNombre || !row[idxNombre]) continue;

      const nombre = row[idxNombre]?.trim().replace(/^["']|["']$/g, "");
      if (!nombre) continue;

      const whatsapp =
        idxTel !== -1 ? row[idxTel]?.trim().replace(/^["']|["']$/g, "") : "";
      const dni =
        idxDni !== -1 ? row[idxDni]?.trim().replace(/^["']|["']$/g, "") : null;

      // 🚀 Limpieza exhaustiva de números de deuda (por si trae comillas o signos pesos)
      let deudaInicial = 0;
      if (idxDeuda !== -1 && row[idxDeuda]) {
        const rawDeuda = row[idxDeuda]
          .replace(/^["']|["']$/g, "")
          .replace(/[^0-9,-]+/g, "")
          .replace(",", ".");
        deudaInicial = parseFloat(rawDeuda) || 0;
      }

      // Insertamos el cliente
      const { data: nuevoCliente, error: errCli } = await supabase
        .from("clientes")
        .insert({
          nombre,
          telefono: whatsapp,
          dni: dni || null,
          saldo_pendiente: deudaInicial > 0 ? deudaInicial : 0,
          activo: true,
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

      // 🚀 FIX: Solo incrementamos si llegamos hasta aquí (éxito real)
      importados++;
    }

    revalidatePath("/clientes");

    if (importados === 0 && rows.length > 1) {
      return {
        error:
          "No se importó ningún cliente. Revisa el registro de errores en la consola (ej. DNI duplicados o campos faltantes).",
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
