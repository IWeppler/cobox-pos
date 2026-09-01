"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { invalidarCatalogoDeSesion } from "@/shared/lib/cache-catalogo";
import { MAX_DESTACADOS } from "@/features/store/lib/portada-catalogo";

/**
 * Publica u oculta del catálogo público un lote de productos.
 *
 * Espejo masivo de togglePublicadoAction (toggle-shared.ts): misma columna,
 * mismo efecto, un solo UPDATE por lote en vez de N round-trips.
 */
export async function bulkTogglePublicadoAction(
  productIds: string[],
  publicado: boolean,
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", success: false };

  if (!productIds || productIds.length === 0) {
    return { error: "No hay productos seleccionados.", success: false };
  }

  const { error } = await supabase
    .from("productos")
    .update({ publicado })
    .in("id", productIds);

  if (error) {
    console.error("Error en bulkTogglePublicado:", error);
    return {
      error: "No se pudo cambiar la visibilidad de los productos.",
      success: false,
    };
  }

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  await invalidarCatalogoDeSesion(supabase);
  return { error: null, success: true };
}

/**
 * Marca o desmarca productos como DESTACADOS de la portada del catálogo.
 *
 * Por qué existe: la portada mostraba los 8 productos con `creado_en` más
 * nuevo ("Recién llegados"), y eso falla justo mientras se están cargando las
 * fotos — los más nuevos son exactamente los que todavía no tienen imagen, y
 * la vidriera abre con ocho recuadros grises. Con destacados el comercio elige
 * los 8 que quiere en la puerta.
 *
 * El TOPE se aplica acá y no en la base (ver 20260901140000): es una regla de
 * producto, no una invariante de integridad. Se cuenta antes de escribir y se
 * rechaza el lote entero si no entra, con el número exacto de cuántos sobran —
 * escribir los primeros que quepan y descartar el resto sin decirlo dejaría al
 * usuario mirando una vidriera que no es la que armó.
 *
 * Ojo: el conteo NO filtra por `negocio_id` a mano. Lo hace la RLS
 * (`security.same_negocio` sobre el negocio activo del header), que es el
 * aislamiento real; agregar el filtro acá sería defensa en profundidad, pero
 * el `negocio_id` del usuario no está a mano en esta action y un valor mal
 * resuelto sería peor que ninguno.
 */
export async function bulkToggleDestacadoAction(
  productIds: string[],
  destacado: boolean,
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", success: false };

  if (!productIds || productIds.length === 0) {
    return { error: "No hay productos seleccionados.", success: false };
  }

  if (destacado) {
    // El lote solo YA no entra: se rechaza sin consultar nada.
    //
    // No es una optimización, es lo que evita un 414. `/stock` deja
    // "seleccionar los N que coinciden con los filtros" —en Evens son ~1.700
    // productos— y el `not.in` de abajo mete un UUID por cada id en la URL:
    // con 1.700 son ~61 kB y PostgREST corta con "Request-URI Too Large". El
    // usuario vería "no se pudo verificar" en vez del mensaje del tope, que es
    // la respuesta correcta y que además ya se sabe sin preguntarle a la base.
    // Con este guard, la consulta de abajo nunca corre con más de 8 ids.
    if (productIds.length > MAX_DESTACADOS) {
      return {
        error:
          `La portada muestra ${MAX_DESTACADOS} destacados y estás eligiendo ` +
          `${productIds.length}. Elegí como máximo ${MAX_DESTACADOS}.`,
        success: false,
      };
    }

    // Los que YA están destacados y no son parte de este lote. Los del lote se
    // excluyen porque volver a marcar uno ya marcado no suma un destacado
    // nuevo: sin este `not.in` una selección de 8 que incluya a los 8 actuales
    // se rechazaría a sí misma.
    const { count, error: errorConteo } = await supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .not("destacado_en", "is", null)
      .not("id", "in", `(${productIds.join(",")})`);

    if (errorConteo) {
      console.error("Error contando destacados:", errorConteo);
      return {
        error: "No se pudo verificar cuántos destacados hay.",
        success: false,
      };
    }

    const yaDestacados = count ?? 0;
    const sobran = yaDestacados + productIds.length - MAX_DESTACADOS;
    if (sobran > 0) {
      return {
        error:
          `La portada muestra ${MAX_DESTACADOS} destacados y ya hay ` +
          `${yaDestacados}. Sacá ${sobran} ${
            sobran === 1 ? "destacado" : "destacados"
          } antes de agregar ${
            productIds.length === 1 ? "este" : `estos ${productIds.length}`
          }.`,
        success: false,
      };
    }
  }

  // La marca es el MOMENTO, no un booleano: la portada ordena por él, así que
  // el último que se marca queda primero. Ver portada-catalogo.ts.
  const { error } = await supabase
    .from("productos")
    .update({ destacado_en: destacado ? new Date().toISOString() : null })
    .in("id", productIds);

  if (error) {
    console.error("Error en bulkToggleDestacado:", error);
    return {
      error: "No se pudieron cambiar los destacados.",
      success: false,
    };
  }

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  await invalidarCatalogoDeSesion(supabase);
  return { error: null, success: true };
}
