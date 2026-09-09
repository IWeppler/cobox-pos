"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { invalidarCatalogoDeSesion } from "@/shared/lib/cache-catalogo";

/** SELECCION = los ids que el usuario marcó en la tabla/grilla de stock.
 * `actualizaciones_precio.tipo_alcance` es `text` sin CHECK, así que el valor
 * nuevo entra al historial sin migración. */
export type AlcancePrecio = "TODOS" | "CATEGORIA" | "SELECCION" | "REMITO";
/**
 * REMITO no lo produce este módulo: lo escribe `aprobar_orden_compra_impl`
 * desde 20260908190000, cuando aprobar un ingreso de mercadería cambia un
 * precio. Hasta entonces un cambio de precio hecho por un remito no dejaba
 * ninguna fila, y por eso no se pudo fechar el caso que reportó Evelyn.
 *
 * Está en el mismo lote y con el mismo formato que un ajuste masivo a
 * propósito: así "Deshacer" del historial de precios funciona sobre un remito
 * sin una línea de código más. Lo que NO deshace es el stock, que ya entró —
 * revertir un lote REMITO devuelve los precios, no la mercadería.
 */
export type OperacionPrecio =
  "AUMENTAR_PORCENTAJE" | "REDUCIR_PORCENTAJE" | "FIJAR_MARGEN" | "REMITO";
export type CampoObjetivo = "PRECIO" | "COSTO" | "AMBOS";
export type TipoRedondeo = "SIN_REDONDEO" | "10" | "50" | "100" | "90" | "99";

export interface PrevisualizacionItem {
  producto_id: string;
  nombre: string;
  categoria: string;
  costo_anterior: number;
  costo_nuevo: number;
  diferencia_costo: number;
  precio_anterior: number;
  precio_nuevo: number;
  diferencia_precio: number;
}

export interface AdvertenciasPrecio {
  productosPrecioCero: number;
  variantesPrecioCero: number;
  reduccionTotal: boolean;
  productosResultanCeroONegativo: number;
}

export interface AjustePrecioHistorialItem {
  id: string;
  nombre: string;
  tipo_alcance: AlcancePrecio;
  tipo_operacion: OperacionPrecio;
  campo_objetivo: CampoObjetivo;
  valor: number;
  estado: string;
  creado_en: string;
  revertido_en: string | null;
  productosAfectados: number;
  variantesAfectadas: number;
  tieneAuditoriaVariantes: boolean;
}

export interface RevertirPreviewItem {
  producto_id: string;
  variante_id: string | null;
  nombre: string;
  /**
   * `null` en una fila de variante = no tenía valor propio, hereda del
   * producto. Distinto de 0, que es un precio de cero. Ver
   * 20260908210000: mostrar los dos como "$0" era prometer que revertir le
   * pone precio cero a algo que en realidad va a quedar siguiendo al producto.
   */
  precio_actual: number | null;
  precio_al_revertir: number | null;
  costo_actual: number | null;
  costo_al_revertir: number | null;
  cambia: boolean;
}

async function esUsuarioAdmin(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // is_admin() resuelve el rol dentro del negocio activo. perfiles.rol quedó
  // deprecada: es NULL para todo usuario invitado, así que leerla acá dejaba a
  // una encargada nueva sin poder actualizar precios.
  const { data: esAdmin } = await supabase.rpc("is_admin");

  return esAdmin === true;
}

// ----------------------------------------------------------------------
// HELPER: Lógica matemática de aplicación y redondeo
// ----------------------------------------------------------------------
function calcularNuevoValor(
  valorOriginal: number,
  operacion: OperacionPrecio,
  valorInput: number,
): number {
  if (operacion === "AUMENTAR_PORCENTAJE")
    return valorOriginal * (1 + valorInput / 100);
  if (operacion === "REDUCIR_PORCENTAJE")
    return valorOriginal * (1 - valorInput / 100);
  return valorOriginal;
}

function aplicarRedondeo(valor: number, tipo: TipoRedondeo): number {
  if (tipo === "SIN_REDONDEO") return Number(valor.toFixed(2));

  const entero = Math.round(valor);

  if (tipo === "10") return Math.ceil(valor / 10) * 10;
  if (tipo === "50") return Math.ceil(valor / 50) * 50;
  if (tipo === "100") return Math.ceil(valor / 100) * 100;

  // Terminar en 90 o 99
  if (tipo === "90") return Math.floor(valor / 100) * 100 + 90;
  if (tipo === "99") return Math.floor(valor / 100) * 100 + 99;

  return entero;
}

// 1. SIMULADOR DE PRECIOS (PREVIEW)
export async function simularPreciosAction(
  alcance: AlcancePrecio,
  categoriaFiltro: string,
  campo: CampoObjetivo,
  operacion: OperacionPrecio,
  valor: number,
  redondeo: TipoRedondeo,
  /** Solo para alcance SELECCION: los productos marcados en el módulo. */
  productIds?: string[],
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // El alcance se resuelve SIEMPRE contra la base, nunca contra lo que el
  // cliente dice que hay adentro: el cliente manda ids, el server relee
  // precio y costo actuales de esos ids.
  if (alcance === "SELECCION" && (!productIds || productIds.length === 0)) {
    return { error: "No hay productos seleccionados." };
  }

  let query = supabase
    .from("productos")
    .select(
      "id, nombre, tipo, categoria_id, precio, precio_costo, categoria:categorias(nombre)",
    );

  if (alcance === "CATEGORIA" && categoriaFiltro !== "todos") {
    query = query.eq("categoria_id", categoriaFiltro);
  }

  if (alcance === "SELECCION") {
    query = query.in("id", productIds!);
  }

  const { data: productos, error } = await query;

  if (error || !productos) {
    return { error: "No se pudieron cargar los productos para la simulación." };
  }

  // Chequeo de precio $0 en variantes del alcance (el operador de % directo
  // no tiene ningún efecto sobre una base en $0, y no había ninguna alerta
  // de esto antes de aplicar el ajuste).
  const productoIds = productos.map((p) => p.id);
  const { data: variantesEnAlcance } = await supabase
    .from("producto_variantes")
    .select("id, producto_id, precio")
    .in("producto_id", productoIds.length > 0 ? productoIds : [""]);

  const esAjustePorcentualSobrePrecio =
    (operacion === "AUMENTAR_PORCENTAJE" ||
      operacion === "REDUCIR_PORCENTAJE") &&
    (campo === "PRECIO" || campo === "AMBOS");

  const productosPrecioCero = esAjustePorcentualSobrePrecio
    ? productos.filter((p) => (Number(p.precio) || 0) === 0).length
    : 0;

  const variantesPrecioCero = esAjustePorcentualSobrePrecio
    ? (variantesEnAlcance || []).filter((v) => (Number(v.precio) || 0) === 0)
        .length
    : 0;

  const reduccionTotal = operacion === "REDUCIR_PORCENTAJE" && valor >= 100;

  const preview: PrevisualizacionItem[] = productos.map((prod) => {
    // Blindaje matemático: si viene null/undefined, es 0.
    const costoBase = Number(prod.precio_costo) || 0;
    const precioBase = Number(prod.precio) || 0;

    let nuevoCosto = costoBase;
    let nuevoPrecio = precioBase;

    if (campo === "COSTO" || campo === "AMBOS") {
      nuevoCosto = calcularNuevoValor(costoBase, operacion, valor);
    }

    if (campo === "PRECIO" || campo === "AMBOS") {
      if (operacion === "FIJAR_MARGEN") {
        // El tipo se llama FIJAR_MARGEN por compatibilidad con el
        // historial ya guardado en actualizaciones_precio(_items), pero la
        // fórmula es de recargo sobre costo (mismo criterio que
        // handleAplicarRecargoGlobal en merge-table.tsx), no margen sobre
        // precio de venta.
        const costoReferencia = campo === "AMBOS" ? nuevoCosto : costoBase;
        nuevoPrecio = costoReferencia * (1 + valor / 100);
      } else {
        nuevoPrecio = calcularNuevoValor(precioBase, operacion, valor);
      }
      nuevoPrecio = aplicarRedondeo(nuevoPrecio, redondeo);
    }

    const categoriaRelacion = Array.isArray(prod.categoria)
      ? prod.categoria[0]
      : prod.categoria;

    return {
      producto_id: prod.id,
      nombre: prod.nombre || "Sin nombre",
      categoria: categoriaRelacion?.nombre || prod.tipo || "Sin categoría",
      costo_anterior: costoBase,
      costo_nuevo: nuevoCosto,
      diferencia_costo: nuevoCosto - costoBase,
      precio_anterior: precioBase,
      precio_nuevo: nuevoPrecio,
      diferencia_precio: nuevoPrecio - precioBase,
    };
  });

  const productosResultanCeroONegativo =
    campo === "PRECIO" || campo === "AMBOS"
      ? preview.filter((item) => item.precio_nuevo <= 0).length
      : 0;

  const advertencias: AdvertenciasPrecio = {
    productosPrecioCero,
    variantesPrecioCero,
    reduccionTotal,
    productosResultanCeroONegativo,
  };

  return { preview, advertencias };
}

// 2. APLICAR CAMBIOS Y GUARDAR LOTE (BATCH)
export async function aplicarPreciosAction(
  nombreLote: string,
  previewData: PrevisualizacionItem[],
  config: {
    alcance: string;
    campo: string;
    operacion: string;
    valor: number;
    redondeo: string;
  },
) {
  if (previewData.length === 0)
    return { error: "No hay productos para actualizar." };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado." };

  // Espejo server-side del gate de UI: la acción entra por dos disparadores
  // (el menú de Acciones y el modo selección), y estar autenticado no alcanza
  // para reescribir precios de todo el catálogo.
  if (!(await esUsuarioAdmin(supabase))) {
    return {
      error: "Solo un administrador puede actualizar precios.",
    };
  }

  try {
    const { data: lote, error: loteError } = await supabase
      .from("actualizaciones_precio")
      .insert({
        nombre:
          nombreLote || `Ajuste ${new Date().toLocaleDateString("es-AR")}`,
        tipo_alcance: config.alcance,
        tipo_operacion: config.operacion,
        campo_objetivo: config.campo,
        valor: config.valor,
        redondeo: config.redondeo,
        cantidad_afectada: previewData.length,
        creado_por: user.id,
      })
      .select("id")
      .single();

    if (loteError || !lote)
      throw new Error("Error creando el registro de actualización.");

    // `null` significa "no tenía valor propio", y desde 20260908210000 la
    // base lo puede guardar. NO es lo mismo que 0: revertir un 0 le escribe
    // cero al precio de la variante y `variante.precio ?? producto.precio`
    // devuelve ese cero, o sea que el producto pasa a venderse a $0.
    // Qué columnas pidió tocar el usuario. La cabecera se escribe entera
    // igual (la preview ya deja `nuevo = viejo` en la que no se toca), pero en
    // las variantes sí importa: escribir un costo que nadie pidió cambiar
    // convertiría un costo heredado en propio.
    const campoObjetivo = config.campo as CampoObjetivo;

    const itemsHistorial: {
      lote_id: string;
      producto_id: string;
      variante_id: string | null;
      costo_anterior: number | null;
      costo_nuevo: number | null;
      precio_anterior: number | null;
      precio_nuevo: number | null;
    }[] = [];

    for (const item of previewData) {
      itemsHistorial.push({
        lote_id: lote.id,
        producto_id: item.producto_id,
        variante_id: null,
        costo_anterior: item.costo_anterior,
        costo_nuevo: item.costo_nuevo,
        precio_anterior: item.precio_anterior,
        precio_nuevo: item.precio_nuevo,
      });

      const { error: updateError } = await supabase
        .from("productos")
        .update({
          precio_costo: item.costo_nuevo,
          precio: item.precio_nuevo,
        })
        .eq("id", item.producto_id);

      if (updateError)
        console.error(
          `Error actualizando producto ${item.producto_id}`,
          updateError,
        );

      // ------------------------------------------------------------------
      // LAS VARIANTES QUE HEREDAN NO SE TOCAN, y esto es lo que producía el
      // bug que reportó Evelyn el 8/9/2026.
      //
      // Hasta hoy este bloque le COPIABA el precio nuevo a todas las
      // variantes del producto, convirtiendo herederas (`precio` null, que
      // significa "seguime al producto") en copias con el número escrito
      // encima. Después el remito cambiaba el precio del producto, la copia
      // se quedaba con el viejo, y como en la venta gana la variante, /stock
      // mostraba un precio y la caja cobraba otro.
      //
      // Medido antes de normalizar: Estilo Bonito corrió 5 ajustes masivos en
      // julio y tenía 1.142 copias sobre 1.514 variantes (75%); Ninja
      // Camisetas y ClickTostado, que nunca corrieron uno, tenían cero en 687.
      // La normalización (20260908200000) limpió las 1.252; esto es lo que
      // evita que vuelvan.
      //
      // Una variante que hereda YA queda actualizada por el UPDATE del
      // producto de arriba: no hay nada que escribirle. Solo se tocan las que
      // tienen valor PROPIO, y columna por columna — una variante puede tener
      // precio propio y costo heredado.
      // ------------------------------------------------------------------
      const { data: variantesPrevias } = await supabase
        .from("producto_variantes")
        .select("id, precio, costo")
        .eq("producto_id", item.producto_id);

      const tocaPrecio = campoObjetivo === "PRECIO" || campoObjetivo === "AMBOS";
      const tocaCosto = campoObjetivo === "COSTO" || campoObjetivo === "AMBOS";

      for (const variante of variantesPrevias || []) {
        const precioPropio = variante.precio !== null;
        const costoPropio = variante.costo !== null;

        // Sin valor propio en ninguna de las dos columnas no hay fila de
        // auditoría: no se la va a tocar, y una fila que dice "de null a
        // null" solo ensucia el "Deshacer".
        if (!(precioPropio && tocaPrecio) && !(costoPropio && tocaCosto)) {
          continue;
        }

        itemsHistorial.push({
          lote_id: lote.id,
          producto_id: item.producto_id,
          variante_id: variante.id,
          costo_anterior: costoPropio ? Number(variante.costo) : null,
          costo_nuevo:
            costoPropio && tocaCosto
              ? item.costo_nuevo
              : costoPropio
                ? Number(variante.costo)
                : null,
          precio_anterior: precioPropio ? Number(variante.precio) : null,
          precio_nuevo:
            precioPropio && tocaPrecio
              ? item.precio_nuevo
              : precioPropio
                ? Number(variante.precio)
                : null,
        });
      }

      // Dos UPDATE filtrados en vez de uno sin filtro: cada columna se escribe
      // solo donde había valor propio. `updated_at` va explícito por el mismo
      // motivo de siempre — sin moverlo, la sincronización incremental del
      // catálogo no se entera del cambio.
      const ahora = new Date().toISOString();

      if (tocaPrecio) {
        const { error } = await supabase
          .from("producto_variantes")
          .update({ precio: item.precio_nuevo, updated_at: ahora })
          .eq("producto_id", item.producto_id)
          .not("precio", "is", null);

        if (error)
          console.error(
            `Error actualizando precios de variantes de ${item.producto_id}`,
            error,
          );
      }

      if (tocaCosto) {
        const { error } = await supabase
          .from("producto_variantes")
          .update({ costo: item.costo_nuevo, updated_at: ahora })
          .eq("producto_id", item.producto_id)
          .not("costo", "is", null);

        if (error)
          console.error(
            `Error actualizando costos de variantes de ${item.producto_id}`,
            error,
          );
      }
    }

    await supabase.from("actualizaciones_precio_items").insert(itemsHistorial);

    revalidatePath("/stock");
    revalidatePath("/store", "layout");
    // El precio es lo que la vidriera muestra: sin invalidar el tag, el
    // catálogo público sigue sirviendo los precios viejos desde
    // `unstable_cache` hasta que vence el TTL. `revalidatePath` solo no
    // alcanza — ver cache-catalogo.ts.
    await invalidarCatalogoDeSesion(supabase);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error en aplicarPreciosAction:", error);
    const message = error instanceof Error ? error.message : null;
    return {
      error:
        message || "Ocurrió un error inesperado al actualizar los precios.",
    };
  }
}

// 3. LISTAR HISTORIAL DE AJUSTES
export async function listarHistorialPreciosAction(): Promise<
  { data: AjustePrecioHistorialItem[]; error?: undefined } | { error: string }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await esUsuarioAdmin(supabase))) {
    return {
      error:
        "Solo un administrador puede ver el historial de ajustes de precio.",
    };
  }

  const { data: lotes, error: lotesError } = await supabase
    .from("actualizaciones_precio")
    .select(
      "id, nombre, tipo_alcance, tipo_operacion, campo_objetivo, valor, estado, creado_en, revertido_en, cantidad_afectada",
    )
    .order("creado_en", { ascending: false });

  if (lotesError || !lotes) {
    return { error: "No se pudo cargar el historial de ajustes." };
  }

  if (lotes.length === 0) return { data: [] };

  const loteIds = lotes.map((l) => l.id);
  const { data: filasVariante } = await supabase
    .from("actualizaciones_precio_items")
    .select("lote_id")
    .in("lote_id", loteIds)
    .not("variante_id", "is", null);

  const variantesPorLote = new Map<string, number>();
  (filasVariante || []).forEach((f) => {
    variantesPorLote.set(f.lote_id, (variantesPorLote.get(f.lote_id) || 0) + 1);
  });

  const data: AjustePrecioHistorialItem[] = lotes.map((lote) => {
    const variantesAfectadas = variantesPorLote.get(lote.id) || 0;
    return {
      id: lote.id,
      nombre: lote.nombre,
      tipo_alcance: lote.tipo_alcance as AlcancePrecio,
      tipo_operacion: lote.tipo_operacion as OperacionPrecio,
      campo_objetivo: lote.campo_objetivo as CampoObjetivo,
      valor: Number(lote.valor),
      estado: lote.estado,
      creado_en: lote.creado_en,
      revertido_en: lote.revertido_en,
      productosAfectados: lote.cantidad_afectada ?? 0,
      variantesAfectadas,
      tieneAuditoriaVariantes: variantesAfectadas > 0,
    };
  });

  return { data };
}

// 4. PREVISUALIZAR REVERSIÓN DE UN LOTE
export async function previsualizarRevertirPreciosAction(
  loteId: string,
): Promise<
  { preview: RevertirPreviewItem[]; error?: undefined } | { error: string }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await esUsuarioAdmin(supabase))) {
    return {
      error: "Solo un administrador puede revertir un ajuste de precios.",
    };
  }

  const { data: items, error: fetchError } = await supabase
    .from("actualizaciones_precio_items")
    .select("producto_id, variante_id, costo_anterior, precio_anterior")
    .eq("lote_id", loteId);

  if (fetchError || !items || items.length === 0)
    return {
      error: "No se encontraron los datos de este ajuste para previsualizar.",
    };

  const productoIds = [...new Set(items.map((i) => i.producto_id))];
  const varianteIds = items
    .filter((i) => i.variante_id)
    .map((i) => i.variante_id as string);

  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, precio, precio_costo")
    .in("id", productoIds);

  const { data: variantes } =
    varianteIds.length > 0
      ? await supabase
          .from("producto_variantes")
          .select("id, nombre_display, precio, costo")
          .in("id", varianteIds)
      : { data: [] };

  const productosMap = new Map((productos || []).map((p) => [p.id, p]));
  const variantesMap = new Map((variantes || []).map((v) => [v.id, v]));

  // `null` se conserva como null en toda la cadena: es "hereda del producto",
  // y aplastarlo contra 0 le haría prometer a la pantalla de confirmación que
  // el precio va a quedar en cero.
  const aNumero = (valor: unknown): number | null =>
    valor === null || valor === undefined ? null : Number(valor);

  const preview: RevertirPreviewItem[] = items.map((item) => {
    const producto = productosMap.get(item.producto_id);
    const precioAlRevertir = aNumero(item.precio_anterior);
    const costoAlRevertir = aNumero(item.costo_anterior);

    if (item.variante_id) {
      const variante = variantesMap.get(item.variante_id);
      const precioActual = aNumero(variante?.precio);
      const costoActual = aNumero(variante?.costo);
      return {
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        nombre: `${producto?.nombre ?? "Producto eliminado"} — ${variante?.nombre_display ?? "variante eliminada"}`,
        precio_actual: precioActual,
        precio_al_revertir: precioAlRevertir,
        costo_actual: costoActual,
        costo_al_revertir: costoAlRevertir,
        cambia:
          precioActual !== precioAlRevertir || costoActual !== costoAlRevertir,
      };
    }

    // Un PRODUCTO siempre tiene precio propio: acá el 0 sí es un 0.
    const precioActual = Number(producto?.precio) || 0;
    const costoActual = Number(producto?.precio_costo) || 0;
    return {
      producto_id: item.producto_id,
      variante_id: null,
      nombre: producto?.nombre ?? "Producto eliminado",
      precio_actual: precioActual,
      precio_al_revertir: precioAlRevertir,
      costo_actual: costoActual,
      costo_al_revertir: costoAlRevertir,
      cambia:
        precioActual !== precioAlRevertir || costoActual !== costoAlRevertir,
    };
  });

  return { preview };
}

// 5. DESHACER LOTE (ROLLBACK)
export async function revertirPreciosAction(loteId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await esUsuarioAdmin(supabase))) {
    return {
      error: "Solo un administrador puede revertir un ajuste de precios.",
    };
  }

  const { data: lote } = await supabase
    .from("actualizaciones_precio")
    .select("estado")
    .eq("id", loteId)
    .single();

  if (lote?.estado === "REVERTIDO") {
    return { error: "Este ajuste ya fue revertido anteriormente." };
  }

  const { data: items, error: fetchError } = await supabase
    .from("actualizaciones_precio_items")
    .select("producto_id, variante_id, costo_anterior, precio_anterior")
    .eq("lote_id", loteId);

  if (fetchError || !items)
    return { error: "No se encontraron los datos para revertir." };

  // ------------------------------------------------------------------------
  // ACÁ HABÍA UN FALLBACK Y SE SACÓ. Decía: "si este producto no tiene fila de
  // variante en el lote, revertí TODAS sus variantes al valor del producto".
  // Tenía sentido cuando toda variante llevaba una copia del precio y los
  // lotes viejos no la registraban. Hoy hace daño por tres motivos:
  //
  //   1. Vuelve a fabricar copias. Escribirle el precio del producto a una
  //      variante que heredaba es exactamente lo que 20260908200000 limpió de
  //      1.252 filas, y lo que hace que /stock y la caja digan cosas distintas.
  //   2. Miente sobre lo que va a hacer. `previsualizarRevertirPreciosAction`
  //      lista SOLO las filas del lote, así que este bloque cambiaba variantes
  //      que la pantalla de confirmación no mostraba.
  //   3. Sobre un lote de remito pisaría el precio especial de una variante,
  //      porque ahí la ausencia de fila significa "no la moví", no "no la
  //      registré" (ver 20260908190000).
  //
  // Sin el fallback, revertir un lote sobre variantes que heredan sigue siendo
  // COMPLETO: devolver el precio del producto las devuelve a todas. Lo único
  // que ya no cubre son las variantes que tenían copia en un lote de julio de
  // 2026 y no quedaron auditadas — 108 filas en Evens, hoy ya normalizadas.
  // ------------------------------------------------------------------------

  for (const item of items) {
    if (item.variante_id) {
      // Fila a nivel variante: revertir solo esa variante puntual.
      //
      // El `variante_id` puede apuntar a una variante que YA NO EXISTE: desde
      // 20260902190000 la columna no tiene FK, así que el id se conserva
      // cuando la variante se borra. Ese UPDATE afecta 0 filas y está bien —
      // una variante que no existe no tiene precio que restaurar.
      //
      // NO convertir esto en "si no existe, caé a la rama de producto": eso es
      // exactamente lo que hacía el ON DELETE SET NULL anterior, y era un bug.
      // La fila de una variante borrada se disfrazaba de fila de nivel
      // producto y pisaba `productos.precio` con el precio viejo de la
      // variante. Eran 66 productos afectados cuando se midió.
      await supabase
        .from("producto_variantes")
        .update({
          costo: item.costo_anterior,
          precio: item.precio_anterior,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.variante_id);
    } else {
      // Fila a nivel producto.
      await supabase
        .from("productos")
        .update({
          precio_costo: item.costo_anterior,
          precio: item.precio_anterior,
        })
        .eq("id", item.producto_id);
    }
  }

  await supabase
    .from("actualizaciones_precio")
    .update({ estado: "REVERTIDO", revertido_en: new Date().toISOString() })
    .eq("id", loteId);

  revalidatePath("/stock");
  // Revertir devuelve los precios anteriores, así que la vidriera también
  // tiene que volver atrás. Mismo motivo que en aplicarPreciosAction.
  revalidatePath("/store", "layout");
  await invalidarCatalogoDeSesion(supabase);
  return { success: true };
}
