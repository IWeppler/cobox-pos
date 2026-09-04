"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { traerTodo } from "@/shared/lib/traer-todo";
import { PERMISOS, tienePermiso } from "@/shared/lib/permisos";

/**
 * Los remitos empezados y sin terminar, para poder verlos ANTES de subir nada.
 *
 * Hasta ahora la única forma de enterarse de que un remito quedó a medias era
 * volver a subir el mismo archivo y toparse con el guard de hash ("esta
 * planilla ya la subiste"). O sea que el trabajo a medio hacer solo aparecía
 * por accidente, y solo si se acertaba con el archivo exacto: un remito de
 * proveedor —que no tiene hash— no aparecía nunca. Eso explica los 26 remitos
 * PENDIENTE para siempre de Evens, que además son los más grandes.
 *
 * `estado = 'PENDIENTE'` es el mismo valor que `aprobar_orden_compra` cambia a
 * 'APROBADA': no hay estado intermedio, así que pendiente = sin conciliar.
 */

export type BorradorIngreso = {
  ordenId: string;
  proveedor: string;
  /** Momento de SUBIDA, no la fecha del papel: es la antigüedad del trabajo
   * pendiente, que es lo que se está mirando acá. */
  creadoEn: string;
  lineas: number;
  unidades: number;
  /** Cuántas líneas ya están vinculadas a un producto del catálogo. Es lo más
   * parecido a "cuánto llevás hecho" que se puede saber sin abrir el remito. */
  lineasVinculadas: number;
  /** Vino de una planilla propia (tiene huella de archivo) o de un remito de
   * proveedor. */
  desdePlanilla: boolean;
  /** Última vez que se guardó progreso en la base, si hay borrador. */
  borradorActualizadoEn: string | null;
};

/** Tope de la lista. Más que esto no es una lista, es un problema de otro
 * tipo — y el modal no es el lugar para resolverlo. */
const MAX_BORRADORES = 25;

export async function getBorradoresIngresoAction(): Promise<{
  error: string | null;
  borradores: BorradorIngreso[];
  /** Cuántos pendientes hay en total, si la lista quedó recortada. */
  total: number;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Mismo permiso que ingresar el remito: un server action es un endpoint, y
  // el que no puede cargar mercadería tampoco tiene por qué ver qué compró el
  // comercio y a quién.
  if (!(await tienePermiso(supabase, PERMISOS.STOCK_INGRESAR_REMITO))) {
    return { error: null, borradores: [], total: 0 };
  }

  const { data: ordenes, error, count } = await supabase
    .from("ordenes_compra")
    .select("id, proveedor, creado_en, hash_planilla", { count: "exact" })
    .eq("estado", "PENDIENTE")
    .order("creado_en", { ascending: false })
    .limit(MAX_BORRADORES);

  if (error) {
    console.error("[BORRADORES INGRESO] ordenes_compra:", error);
    return { error: "No se pudieron leer los remitos pendientes.", borradores: [], total: 0 };
  }

  if (!ordenes || ordenes.length === 0) {
    return { error: null, borradores: [], total: 0 };
  }

  const ids = ordenes.map((o) => o.id as string);

  // Los items pasan por traerTodo: 25 remitos de 200 líneas son 5.000 filas y
  // el tope de 1000 de PostgREST se aplica en silencio — el contador de líneas
  // saldría corto sin un solo error.
  const [items, borradores] = await Promise.all([
    traerTodo<{ orden_id: string; cantidad: number; producto_id: string | null }>(
      "borradores: items",
      (desde, hasta) =>
        supabase
          .from("ordenes_items")
          .select("orden_id, cantidad, producto_id", { count: "exact" })
          .in("orden_id", ids)
          .range(desde, hasta),
    ),
    supabase
      .from("ordenes_borradores")
      // Solo la marca de tiempo: `payload` es la conciliación entera y traerla
      // para 25 remitos serían megabytes por abrir un modal.
      .select("orden_id, actualizado_en")
      .in("orden_id", ids),
  ]);

  if (borradores.error) {
    // El borrador es información de más: sin él la fila igual sirve para
    // continuar o descartar.
    console.error("[BORRADORES INGRESO] ordenes_borradores:", borradores.error);
  }

  const porOrden = new Map<
    string,
    { lineas: number; unidades: number; vinculadas: number }
  >();
  for (const item of items.data) {
    const acumulado = porOrden.get(item.orden_id) ?? {
      lineas: 0,
      unidades: 0,
      vinculadas: 0,
    };
    acumulado.lineas += 1;
    acumulado.unidades += Number(item.cantidad ?? 0);
    if (item.producto_id) acumulado.vinculadas += 1;
    porOrden.set(item.orden_id, acumulado);
  }

  const borradorPorOrden = new Map(
    (borradores.data ?? []).map((b) => [
      b.orden_id as string,
      b.actualizado_en as string,
    ]),
  );

  return {
    error: null,
    total: count ?? ordenes.length,
    borradores: ordenes.map((orden) => {
      const conteo = porOrden.get(orden.id as string);
      const borrador = borradorPorOrden.get(orden.id as string);
      return {
        ordenId: orden.id as string,
        proveedor: (orden.proveedor as string) ?? "Sin proveedor",
        creadoEn: orden.creado_en as string,
        lineas: conteo?.lineas ?? 0,
        unidades: conteo?.unidades ?? 0,
        lineasVinculadas: conteo?.vinculadas ?? 0,
        desdePlanilla: Boolean(orden.hash_planilla),
        borradorActualizadoEn: borrador ?? null,
      };
    }),
  };
}

/**
 * Descarta un remito sin conciliar.
 *
 * El DELETE es CONDICIONAL por `estado = 'PENDIENTE'` y se chequean las filas
 * afectadas: entre que la lista se dibujó y se apretó el botón, alguien en
 * otra caja pudo haber aprobado ese mismo remito, y borrar una orden aprobada
 * dejaría el stock cargado sin el papel que lo explica. Un `select` previo no
 * alcanza: dos llamadas concurrentes leerían lo mismo.
 *
 * No toca stock —una orden PENDIENTE nunca lo impactó— y no borra los
 * productos que la carga inicial haya creado desde este remito: existen por su
 * cuenta en el catálogo, y borrarlos podría llevarse puesto algo que ya se
 * vendió. `ordenes_items` y `ordenes_borradores` se van por CASCADE, y el
 * egreso de caja que apunte a la orden queda con `orden_compra_id` en null
 * (ON DELETE SET NULL): la plata salió igual y el arqueo tiene que seguir
 * cerrando.
 */
export async function descartarOrdenPendienteAction(ordenId: string): Promise<{
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await tienePermiso(supabase, PERMISOS.STOCK_INGRESAR_REMITO))) {
    return { error: "No tenés permiso para descartar remitos." };
  }

  const { data, error } = await supabase
    .from("ordenes_compra")
    .delete()
    .eq("id", ordenId)
    .eq("estado", "PENDIENTE")
    .select("id");

  if (error) {
    console.error("[BORRADORES INGRESO] descartar:", error);
    return { error: "No se pudo descartar el remito." };
  }

  if (!data || data.length === 0) {
    return {
      error:
        "Ese remito ya no está pendiente: puede haberse aprobado o descartado desde otra pantalla.",
    };
  }

  revalidatePath("/stock");
  return { error: null };
}
