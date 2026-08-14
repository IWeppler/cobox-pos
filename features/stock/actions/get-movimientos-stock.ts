"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export type TipoMovimiento = "INGRESO" | "EGRESO";

export interface MovimientoStock {
  id: string;
  fecha: string;
  productoId: string;
  producto: string;
  variante: string;
  tipo: TipoMovimiento;
  cantidad: number;
  origen: string;
  usuario: string | null;
  /** Solo en los ingresos por remito: con qué remito agrupar la fila. */
  remitoId?: string;
  proveedor?: string;
}

export interface FiltrosMovimientosStock {
  /** ISO date (yyyy-mm-dd) o timestamp. Inclusive. */
  fechaDesde?: string;
  /** ISO date (yyyy-mm-dd) o timestamp. Inclusive. */
  fechaHasta?: string;
}

type SupabaseServerClient = ReturnType<typeof createClient>;

/** Sin tipos de Database generados, el cliente de Supabase infiere los
 * embeds a-uno (`productos ( nombre )`) como array — este helper normaliza
 * ambas formas posibles en vez de confiar en la forma de un solo caso. */
function extraerNombreProducto(
  productos: { nombre?: string | null } | { nombre?: string | null }[] | null,
): string {
  const fila = Array.isArray(productos) ? productos[0] : productos;
  return fila?.nombre ?? "Producto eliminado";
}

/** Fila "cruda" antes de resolver el nombre del usuario — todas las
 * fuentes devuelven esto y recién al final se pisa `usuario` con el
 * nombre real, para no pagar una consulta a `perfiles` por fuente. */
type MovimientoCrudo = Omit<MovimientoStock, "usuario"> & {
  usuarioId: string | null;
};

// ----------------------------------------------------------------------
// FUENTE 1 — Ingresos por remito (única forma real de reponer stock desde
// un proveedor). ordenes_compra no tiene columna de usuario: no hay forma
// de saber quién aprobó el remito hoy.
// ----------------------------------------------------------------------
async function obtenerIngresosRemitos(
  supabase: SupabaseServerClient,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<MovimientoCrudo[]> {
  // Se filtra por `aprobado_en` y no por `creado_en`: el stock se mueve cuando
  // el remito se APRUEBA, no cuando se carga. Filtrando por la carga, un
  // remito cargado a fin de mes y conciliado a principios del siguiente no
  // aparecía en ninguno de los dos períodos.
  let query = supabase
    .from("ordenes_compra")
    .select("id, proveedor, creado_en, aprobado_en, fecha_remito")
    .eq("estado", "APROBADA");

  if (fechaDesde) query = query.gte("aprobado_en", fechaDesde);
  if (fechaHasta) query = query.lte("aprobado_en", fechaHasta);

  const { data: ordenes, error: ordenesError } = await query;
  if (ordenesError) {
    console.error("[MOVIMIENTOS STOCK] ordenes_compra", ordenesError);
    return [];
  }
  if (!ordenes || ordenes.length === 0) return [];

  const ordenesMap = new Map(ordenes.map((o) => [o.id, o]));

  const { data: items, error: itemsError } = await supabase
    .from("ordenes_items")
    .select(
      "id, orden_id, cantidad, raw_variante, variante_match, producto_id, productos ( nombre )",
    )
    .in(
      "orden_id",
      ordenes.map((o) => o.id),
    )
    .not("producto_id", "is", null);

  if (itemsError) {
    console.error("[MOVIMIENTOS STOCK] ordenes_items", itemsError);
    return [];
  }

  return (items ?? []).flatMap((item) => {
    const orden = ordenesMap.get(item.orden_id);
    if (!orden || !item.producto_id) return [];

    return [
      {
        id: `remito-${item.id}`,
        fecha: orden.aprobado_en ?? orden.creado_en,
        productoId: item.producto_id,
        producto: extraerNombreProducto(item.productos),
        variante: item.variante_match || item.raw_variante || "Único",
        tipo: "INGRESO" as const,
        cantidad: item.cantidad,
        origen: `Remito — ${orden.proveedor}`,
        usuarioId: null,
        // Permite agrupar por remito en la vista y abrir su detalle.
        remitoId: orden.id,
        proveedor: orden.proveedor,
      },
    ];
  });
}

// ----------------------------------------------------------------------
// FUENTE 2 — Ingresos por devolución de cliente (venta anulada con
// motivo_anulacion = 'RESTAURAR_STOCK'). Sin esa columna esto no se podía
// reconstruir en absoluto — no había ninguna tabla que registrara cuál de
// los dos caminos de anularVentaAction se había tomado.
// ----------------------------------------------------------------------
async function obtenerIngresosDevoluciones(
  supabase: SupabaseServerClient,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<MovimientoCrudo[]> {
  let query = supabase
    .from("ventas")
    .select(
      "id, fecha_venta, vendedor_id, ventas_items ( id, producto_id, variante, cantidad, productos ( nombre ) )",
    )
    .eq("estado_operacion", "ANULADA")
    .eq("motivo_anulacion", "RESTAURAR_STOCK");

  if (fechaDesde) query = query.gte("fecha_venta", fechaDesde);
  if (fechaHasta) query = query.lte("fecha_venta", fechaHasta);

  const { data: ventas, error } = await query;
  if (error) {
    console.error("[MOVIMIENTOS STOCK] devoluciones", error);
    return [];
  }

  return (ventas ?? []).flatMap((venta) =>
    (venta.ventas_items ?? []).flatMap((item) => {
      if (!item.producto_id) return [];
      return [
        {
          id: `devolucion-${item.id}`,
          fecha: venta.fecha_venta,
          productoId: item.producto_id,
          producto: extraerNombreProducto(item.productos),
          variante: item.variante || "Único",
          tipo: "INGRESO" as const,
          cantidad: item.cantidad,
          origen: `Devolución de cliente — Venta #${venta.id.slice(0, 8)}`,
          usuarioId: venta.vendedor_id,
        },
      ];
    }),
  );
}

// ----------------------------------------------------------------------
// FUENTE 3 — Egresos por venta. Se incluyen ventas ANULADAS también: el
// descuento original de stock ocurrió igual en su momento; la devolución
// (fuente 2) es un evento posterior y separado, no una corrección del
// mismo registro.
// ----------------------------------------------------------------------
async function obtenerEgresosVentas(
  supabase: SupabaseServerClient,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<MovimientoCrudo[]> {
  let query = supabase
    .from("ventas")
    .select(
      "id, fecha_venta, vendedor_id, ventas_items ( id, producto_id, variante, cantidad, productos ( nombre ) )",
    );

  if (fechaDesde) query = query.gte("fecha_venta", fechaDesde);
  if (fechaHasta) query = query.lte("fecha_venta", fechaHasta);

  const { data: ventas, error } = await query;
  if (error) {
    console.error("[MOVIMIENTOS STOCK] ventas", error);
    return [];
  }

  return (ventas ?? []).flatMap((venta) =>
    (venta.ventas_items ?? []).flatMap((item) => {
      if (!item.producto_id) return [];
      return [
        {
          id: `venta-${item.id}`,
          fecha: venta.fecha_venta,
          productoId: item.producto_id,
          producto: extraerNombreProducto(item.productos),
          variante: item.variante || "Único",
          tipo: "EGRESO" as const,
          cantidad: item.cantidad,
          origen: `Venta #${venta.id.slice(0, 8)}`,
          usuarioId: venta.vendedor_id,
        },
      ];
    }),
  );
}

// ----------------------------------------------------------------------
// FUENTE 4 — Egresos por baja aprobada. Se excluyen explícitamente las de
// origen='DEVOLUCION_VENTA': esas no descuentan stock por sí solas (el
// descuento ya está contado en la venta original, fuente 3) — incluirlas
// acá duplicaría la misma unidad de stock.
// ----------------------------------------------------------------------
async function obtenerEgresosBajas(
  supabase: SupabaseServerClient,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<MovimientoCrudo[]> {
  let query = supabase
    .from("bajas")
    .select(
      "id, cantidad, variante, motivo, creado_en, creado_por, producto_id, productos ( nombre )",
    )
    .eq("estado", "APROBADA")
    .eq("origen", "MANUAL");

  if (fechaDesde) query = query.gte("creado_en", fechaDesde);
  if (fechaHasta) query = query.lte("creado_en", fechaHasta);

  const { data: bajas, error } = await query;
  if (error) {
    console.error("[MOVIMIENTOS STOCK] bajas", error);
    return [];
  }

  return (bajas ?? []).map((baja) => ({
    id: `baja-${baja.id}`,
    fecha: baja.creado_en,
    productoId: baja.producto_id,
    producto: extraerNombreProducto(baja.productos),
    variante: baja.variante || "Único",
    tipo: "EGRESO" as const,
    cantidad: baja.cantidad,
    origen: `Baja de inventario — ${baja.motivo}`,
    usuarioId: baja.creado_por,
  }));
}

// ----------------------------------------------------------------------
// FUENTE 5 — Ajustes manuales desde la edición de producto
// (producto_variantes_auditoria). Único lugar donde un cambio de stock
// que no es venta/remito/baja queda registrado. accion='BLOQUEADO_FALTANTE'
// se excluye siempre (el guardado no se aplicó, no hubo cambio real);
// accion='ELIMINADA' cuenta como egreso de stock_anterior unidades, no
// como "sin cambio" — la variante entera dejó de existir.
// ----------------------------------------------------------------------
async function obtenerAjustesManuales(
  supabase: SupabaseServerClient,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<MovimientoCrudo[]> {
  let query = supabase
    .from("producto_variantes_auditoria")
    .select(
      "id, producto_id, nombre_display, atributos, accion, stock_anterior, stock_nuevo, editado_por, creado_en, productos ( nombre )",
    )
    .in("accion", ["CREADA", "ACTUALIZADA", "ELIMINADA"]);

  if (fechaDesde) query = query.gte("creado_en", fechaDesde);
  if (fechaHasta) query = query.lte("creado_en", fechaHasta);

  const { data: filas, error } = await query;
  if (error) {
    console.error("[MOVIMIENTOS STOCK] producto_variantes_auditoria", error);
    return [];
  }

  return (filas ?? []).flatMap((fila) => {
    const antes = fila.stock_anterior ?? 0;
    // ELIMINADA no trae stock_nuevo (la fila ya no existe) — a los fines
    // del movimiento, "después" es 0: se perdieron `antes` unidades.
    const despues = fila.accion === "ELIMINADA" ? 0 : (fila.stock_nuevo ?? 0);
    const delta = despues - antes;
    if (delta === 0) return [];

    const atributos = (fila.atributos as Record<string, string>) ?? {};
    const variante =
      fila.nombre_display ||
      Object.entries(atributos)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" / ") ||
      "Único";

    return [
      {
        id: `ajuste-${fila.id}`,
        fecha: fila.creado_en,
        productoId: fila.producto_id,
        producto: extraerNombreProducto(fila.productos),
        variante,
        tipo: (delta > 0 ? "INGRESO" : "EGRESO") as TipoMovimiento,
        cantidad: Math.abs(delta),
        origen: "Ajuste manual",
        usuarioId: fila.editado_por,
      },
    ];
  });
}

// ----------------------------------------------------------------------
// ORQUESTADOR
// ----------------------------------------------------------------------
export async function obtenerMovimientosStockAction(
  filtros: FiltrosMovimientosStock = {},
): Promise<
  | { data: MovimientoStock[]; error?: undefined }
  | { data?: undefined; error: string }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { fechaDesde, fechaHasta } = filtros;

  // 5 fuentes, 5 tablas distintas con distinta forma de join — a este
  // volumen (cientos de filas por rango de fechas, no decenas de miles)
  // separar las consultas y mezclar en JS es más simple de mantener y
  // depurar que un UNION ALL o una vista materializada, y el filtro de
  // fecha ya se aplica a nivel SQL en cada una para no traer historial
  // completo cada vez.
  const [remitos, devoluciones, ventas, bajas, ajustes] = await Promise.all([
    obtenerIngresosRemitos(supabase, fechaDesde, fechaHasta),
    obtenerIngresosDevoluciones(supabase, fechaDesde, fechaHasta),
    obtenerEgresosVentas(supabase, fechaDesde, fechaHasta),
    obtenerEgresosBajas(supabase, fechaDesde, fechaHasta),
    obtenerAjustesManuales(supabase, fechaDesde, fechaHasta),
  ]);

  const crudos = [...remitos, ...devoluciones, ...ventas, ...bajas, ...ajustes];

  const usuarioIds = [
    ...new Set(
      crudos.map((m) => m.usuarioId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const usuariosPorId = new Map<string, string>();
  if (usuarioIds.length > 0) {
    const { data: perfiles } = await supabase
      .from("perfiles")
      .select("id, nombre")
      .in("id", usuarioIds);
    (perfiles ?? []).forEach((p) => usuariosPorId.set(p.id, p.nombre));
  }

  const data: MovimientoStock[] = crudos
    .map(({ usuarioId, ...resto }) => ({
      ...resto,
      usuario: usuarioId ? (usuariosPorId.get(usuarioId) ?? null) : null,
    }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return { data };
}
