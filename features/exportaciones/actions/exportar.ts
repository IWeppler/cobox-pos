"use server";

import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import { createClient } from "@/shared/config/supabase/server";
import { PERMISOS, tienePermiso } from "@/shared/lib/permisos";
import { formatearFechaISO } from "@/shared/lib/periodo-ranges";
import {
  rangoDeExportacion,
  type PeriodoExportacion,
} from "../lib/periodo-exportacion";
import {
  definicionDe,
  esExportable,
  type ClaveExportacion,
} from "../lib/catalogo-exportaciones";
import {
  filasComprobantes,
  filasCompras,
  filasMovimientosCaja,
  filasMovimientosGenerales,
  filasVentas,
  type Fila,
} from "../lib/construir-filas";

export interface ResultadoExportacion {
  error: string | null;
  /** Workbook en base64. Se genera en el SERVER y no en el navegador: los
   * datos de una exportación contable salen de la base ya filtrados por RLS,
   * y armarla en el cliente obligaría a mandarle todo el período crudo. */
  archivoBase64?: string;
  nombreArchivo?: string;
  filas?: number;
}

export async function exportarAction(
  clave: ClaveExportacion,
  periodo: PeriodoExportacion,
): Promise<ResultadoExportacion> {
  const definicion = definicionDe(clave);

  // Fail-closed en dos pasos: que la clave exista en el catálogo Y que esté
  // marcada como disponible. La clave viene del cliente; que el botón esté
  // deshabilitado en la UI no es un control.
  if (!definicion) {
    return { error: "Esa exportación no existe." };
  }
  if (!esExportable(clave)) {
    return {
      error:
        definicion.motivoNoDisponible ??
        "Esa exportación todavía no está disponible.",
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Una exportación contable es el negocio entero en una planilla: quién puede
  // bajarla es la misma pregunta que quién puede ver los reportes.
  if (!(await tienePermiso(supabase, PERMISOS.REPORTES_VER_MODULO))) {
    return { error: "No tenés permiso para exportar información del negocio." };
  }

  // El rango lo resuelve el SERVER, no el cliente: mismo criterio que
  // `p_periodo` en el resumen gerencial. Un rango que llega armado desde el
  // navegador es un rango que se puede estirar.
  const { inicio, fin } = rangoDeExportacion(periodo);
  const desde = inicio.toISOString();
  const hasta = fin.toISOString();

  let filas: Fila[] = [];

  try {
    filas = await construirFilas(supabase, clave, desde, hasta);
  } catch (err) {
    console.error("[EXPORTACION] Error armando", clave, err);
    return { error: "No se pudo armar la exportación." };
  }

  if (filas.length === 0) {
    return {
      error: `No hay datos de "${definicion.titulo}" en el período elegido.`,
    };
  }

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  // El nombre de hoja de Excel no admite más de 31 caracteres ni algunos
  // símbolos; se recorta en vez de dejar que la librería falle.
  XLSX.utils.book_append_sheet(libro, hoja, definicion.titulo.slice(0, 31));

  const buffer = XLSX.write(libro, { type: "base64", bookType: "xlsx" });

  const nombreArchivo = `${clave}_${formatearFechaISO(inicio)}_a_${formatearFechaISO(fin)}.xlsx`;

  return {
    error: null,
    archivoBase64: buffer,
    nombreArchivo,
    filas: filas.length,
  };
}

type Supabase = ReturnType<typeof createClient>;

async function construirFilas(
  supabase: Supabase,
  clave: ClaveExportacion,
  desde: string,
  hasta: string,
): Promise<Fila[]> {
  switch (clave) {
    case "ventas": {
      const { data } = await supabase
        .from("ventas")
        .select(
          "id, fecha_venta, estado_operacion, estado_pago, metodo_pago, total, recargo_metodo_total, precio_costo, comision_total, total_neto, monto_cobrado, monto_pendiente, cantidad, clientes(nombre), perfiles(nombre), comprobantes(tipo, punto_venta, numero)",
        )
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta)
        .order("fecha_venta", { ascending: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return filasVentas((data ?? []) as any);
    }

    case "comprobantes": {
      const { data } = await supabase
        .from("comprobantes")
        .select(
          "tipo, punto_venta, numero, emitido_en, total, neto, iva_monto, cae, cae_vencimiento, receptor_razon_social, receptor_cuit, receptor_condicion_iva, venta_id",
        )
        .gte("emitido_en", desde)
        .lte("emitido_en", hasta)
        .order("emitido_en", { ascending: true });

      return filasComprobantes(data ?? []);
    }

    case "compras": {
      const { data } = await supabase
        .from("ordenes_compra")
        .select("id, proveedor, fecha_remito, total_presupuestado, estado, creado_en")
        .gte("creado_en", desde)
        .lte("creado_en", hasta)
        .order("creado_en", { ascending: true });

      return filasCompras(data ?? []);
    }

    case "movimientos_caja": {
      const { data } = await supabase
        .from("turnos_caja")
        .select(
          // El embed va por vendedor_id: `usuario_id` apunta a auth.users, no
          // a perfiles, así que por ahí no hay relación que PostgREST pueda
          // resolver.
          "id, fecha_apertura, fecha_cierre, estado, modo, monto_inicial, efectivo_esperado, monto_declarado, diferencia, observacion_cierre, perfiles!turnos_caja_vendedor_id_fkey(nombre)",
        )
        .gte("fecha_apertura", desde)
        .lte("fecha_apertura", hasta)
        .order("fecha_apertura", { ascending: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return filasMovimientosCaja((data ?? []) as any);
    }

    case "movimientos_generales": {
      const [pagos, egresos] = await Promise.all([
        supabase
          .from("venta_pagos")
          .select(
            "creado_en, metodo_nombre, metodo_tipo, monto_base, recargo_monto, monto_bruto, comision_monto, monto_neto, tipo_movimiento, estado_pago_operacion, venta_id",
          )
          .gte("creado_en", desde)
          .lte("creado_en", hasta),
        supabase
          .from("egresos")
          .select("fecha, concepto, monto, tipo")
          .gte("fecha", desde)
          .lte("fecha", hasta),
      ]);

      return filasMovimientosGenerales(pagos.data ?? [], egresos.data ?? []);
    }

    default:
      // Las claves no disponibles ya se cortaron arriba; esto cubre el caso de
      // agregar una al catálogo como disponible y olvidarse de la consulta.
      throw new Error(`Exportación sin implementar: ${clave}`);
  }
}
