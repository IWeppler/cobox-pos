"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { invalidarCatalogoDeSesion } from "@/shared/lib/cache-catalogo";

/**
 * Fundir un producto duplicado dentro del que se queda.
 *
 * POR QUÉ EXISTE. El 10/9/2026 un remito creó "REMERONES VANIC OVERSIZE"
 * cuando ese producto ya existía con el nombre idéntico. Hasta hoy eso se
 * resolvía de dos formas: borrando uno y perdiendo su stock, o escribiendo
 * SQL — que la dueña no puede. Quedan 11 duplicados reales en el SaaS,
 * contados por nombre + categoría + marca (por nombre solo dan 42, y 30 de
 * esos son la misma prenda en categorías distintas, que NO es un duplicado).
 *
 * Toda la escritura vive en la RPC `fusionar_productos` (20260910180000), en
 * una transacción: mover variantes, SUMAR las que coinciden, y reapuntar
 * ventas, remitos, alias, promos, reservas y auditoría ANTES del borrado. Acá
 * no se replica nada de eso — trece tablas apuntan a `productos.id` y hacerlo
 * con updates sueltos desde Node es dejar el historial a mitad de camino si
 * uno falla.
 */

export interface PreviewFusion {
  ok: boolean;
  error?: string;
  origenNombre?: string;
  destinoNombre?: string;
  variantesAMover?: number;
  /** Las que existen en los dos: su stock se SUMA y no se puede deshacer. */
  variantesASumar?: number;
  variantesFinales?: number;
  unidadesFinales?: number;
  ventasAReapuntar?: number;
  lineasRemitoAReapuntar?: number;
  aliasAReapuntar?: number;
  origenTieneFoto?: boolean;
  destinoTieneFoto?: boolean;
  origenPrecio?: number | null;
  destinoPrecio?: number | null;
  /** Los dos ejes que definen un duplicado además del nombre. */
  mismaCategoria?: boolean;
  mismaMarca?: boolean;
}

/**
 * Qué pasaría, sin escribir nada.
 *
 * Es obligatorio mostrarlo antes de fusionar: la operación NO tiene rollback.
 * Separar "3 unidades" de vuelta en 1 + 2 es una suposición, no un dato — nada
 * dice cuál de las dos filas trajo cuál unidad.
 */
export async function previsualizarFusionAction(
  origenId: string,
  destinoId: string,
): Promise<PreviewFusion> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("previsualizar_fusion_productos", {
    p_origen: origenId,
    p_destino: destinoId,
  });

  if (error) {
    console.error("[FUSION] preview", error);
    return { ok: false, error: "No se pudo calcular la fusión." };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "MISMO_PRODUCTO"
          ? "Es el mismo producto."
          : "No encontramos alguno de los dos productos.",
    };
  }

  return {
    ok: true,
    origenNombre: r.origen_nombre as string,
    destinoNombre: r.destino_nombre as string,
    variantesAMover: Number(r.variantes_a_mover ?? 0),
    variantesASumar: Number(r.variantes_a_sumar ?? 0),
    variantesFinales: Number(r.variantes_finales ?? 0),
    unidadesFinales: Number(r.unidades_finales ?? 0),
    ventasAReapuntar: Number(r.ventas_a_reapuntar ?? 0),
    lineasRemitoAReapuntar: Number(r.lineas_remito_a_reapuntar ?? 0),
    aliasAReapuntar: Number(r.alias_a_reapuntar ?? 0),
    origenTieneFoto: Boolean(r.origen_tiene_foto),
    destinoTieneFoto: Boolean(r.destino_tiene_foto),
    origenPrecio: r.origen_precio === null ? null : Number(r.origen_precio),
    destinoPrecio: r.destino_precio === null ? null : Number(r.destino_precio),
    mismaCategoria: Boolean(r.misma_categoria),
    mismaMarca: Boolean(r.misma_marca),
  };
}

export interface ResultadoFusion {
  ok: boolean;
  error?: string;
  variantesMovidas?: number;
  variantesSumadas?: number;
  unidades?: number;
}

/**
 * Los errores que la RPC lanza a propósito, traducidos.
 *
 * Sin esto la pantalla muestra el texto crudo de Postgres, que no dice qué
 * hacer. Es el mismo criterio que `mensajeDeBorrado` en delete-product.ts.
 */
function mensajeDeFusion(mensaje: string): string {
  if (mensaje.includes("SIN_PERMISO_PARA_BORRAR")) {
    return "No tenés permiso para eliminar productos, y fusionar borra el duplicado.";
  }
  if (mensaje.includes("NEGOCIOS_DISTINTOS")) {
    return "Esos productos son de comercios distintos.";
  }
  if (mensaje.includes("PRODUCTO_NO_ENCONTRADO")) {
    return "Alguno de los dos productos ya no existe. Recargá la pantalla.";
  }
  if (mensaje.includes("MISMO_PRODUCTO")) {
    return "Es el mismo producto.";
  }
  if (mensaje.includes("UNIDADES_NO_CIERRAN")) {
    // El guard de la RPC abortó: no se escribió nada. Es un bug, no un caso
    // de uso, y por eso el mensaje pide reportarlo en vez de reintentar.
    return "La cuenta de unidades no cerró y no se tocó nada. Avisanos antes de reintentar.";
  }
  return "No se pudo fusionar.";
}

export async function fusionarProductosAction(
  origenId: string,
  destinoId: string,
): Promise<ResultadoFusion> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("fusionar_productos", {
    p_origen: origenId,
    p_destino: destinoId,
  });

  if (error) {
    console.error("[FUSION]", error);
    return { ok: false, error: mensajeDeFusion(error.message ?? "") };
  }

  const r = (data ?? {}) as Record<string, unknown>;

  revalidatePath("/stock");
  // El catálogo público y el POS tienen su propia copia: sin invalidar, el
  // producto borrado sigue apareciendo y venderlo tira "Error de stock en…".
  await invalidarCatalogoDeSesion(supabase);

  return {
    ok: true,
    variantesMovidas: Number(r.variantes_movidas ?? 0),
    variantesSumadas: Number(r.variantes_sumadas ?? 0),
    unidades: Number(r.unidades ?? 0),
  };
}

export interface CandidatoFusion {
  id: string;
  nombre: string;
  variantes: number;
  stock: number;
  mismaCategoria: boolean;
  mismaMarca: boolean;
}

/**
 * Los productos con los que se puede fusionar este, ordenados por lo parecidos
 * que son.
 *
 * Los que comparten nombre + categoría + marca van primero: esa es la
 * definición de duplicado que dio la dueña, y la que corrige el conteo de 42 a
 * 11. Los demás se buscan igual por texto — fusionar dos productos que se
 * llaman distinto es legítimo (el caso original fue "remerones vanic
 * oversize" escrito de dos formas) y la pantalla no puede impedirlo.
 */
export async function buscarCandidatosFusionAction(
  productoId: string,
  texto: string,
): Promise<CandidatoFusion[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: base } = await supabase
    .from("productos")
    .select("nombre, categoria_id, marca")
    .eq("id", productoId)
    .maybeSingle();

  const busqueda = texto.trim() || (base?.nombre as string) || "";

  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, categoria_id, marca, producto_variantes(stock)")
    .neq("id", productoId)
    .ilike("nombre", `%${busqueda}%`)
    .limit(20);

  if (error) {
    console.error("[FUSION] candidatos", error);
    return [];
  }

  const normalizar = (v: unknown) =>
    String(v ?? "").trim().toUpperCase();

  return (data ?? [])
    .map((p) => {
      const variantes = (p.producto_variantes ?? []) as { stock: number }[];
      return {
        id: p.id as string,
        nombre: p.nombre as string,
        variantes: variantes.length,
        stock: variantes.reduce((t, v) => t + Number(v.stock ?? 0), 0),
        mismaCategoria: p.categoria_id === base?.categoria_id,
        mismaMarca: normalizar(p.marca) === normalizar(base?.marca),
      };
    })
    .sort((a, b) => {
      // Duplicado verdadero primero: nombre + categoría + marca.
      const puntaje = (c: CandidatoFusion) =>
        (c.nombre.trim().toUpperCase() === normalizar(base?.nombre) ? 4 : 0) +
        (c.mismaCategoria ? 2 : 0) +
        (c.mismaMarca ? 1 : 0);
      return puntaje(b) - puntaje(a);
    });
}
