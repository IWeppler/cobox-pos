"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { invalidarCatalogo } from "@/shared/lib/cache-catalogo";
import { parseProductImages } from "@/features/stock/lib/stock-product-utils";
import { MAX_IMAGENES_PRODUCTO } from "@/shared/utils/limites-imagen";
import {
  esUrlImagenPropia,
  type UrlsImagenesProducto,
} from "@/features/stock/lib/imagenes-producto-comun";

export type FotosResult = {
  success: boolean;
  error?: string;
  /** La galería como quedó, para que el cliente sincronice sin refetch. */
  imagenes?: string[];
};

/**
 * Agrega o quita fotos de un producto, AL INSTANTE y sin pasar por el
 * formulario.
 *
 * POR QUÉ ES UNA ACTION APARTE
 * Una foto no es un campo de formulario, es una acción: se sube y ya está, se
 * saca y ya está. Atarla al botón Guardar traía dos problemas que costaron
 * trabajo real:
 *
 *  1. Si el guardado fallaba (red del celular), se perdía la foto ya elegida
 *     junto con todo lo demás.
 *  2. Cambiar solo una foto disparaba el guardado entero del producto, con su
 *     confirmación de variantes incluida.
 *
 * `Cancelar` sigue cancelando el resto del formulario: nombre, precio,
 * variantes. Las fotos ya no dependen de él.
 *
 * NO BORRA DE STORAGE. Quitar una foto suelta la URL del producto y deja el
 * archivo donde está — es lo que ya hacía el guardado por formulario
 * (`borrar-imagenes-producto` solo corre al eliminar el producto entero). Un
 * toque mal dado en un celular se arregla; un archivo borrado, no.
 */
export async function actualizarFotosProductoAction(
  productoId: string,
  cambios: { agregar?: UrlsImagenesProducto; quitar?: string[] },
): Promise<FotosResult> {
  if (!productoId) return { success: false, error: "Falta el producto." };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sesión no válida." };

  const { data: negocioId } = await supabase.rpc("negocio_actual");
  if (!negocioId) {
    return { success: false, error: "No hay un negocio activo." };
  }

  // Se parte SIEMPRE de lo que hay en la base, nunca de una lista que mande el
  // cliente: el sheet puede tener datos viejos en memoria (otra pestaña, otra
  // sesión) y pisar fotos que ni sabe que existen.
  const { data: actual, error: errorLectura } = await supabase
    .from("productos")
    .select("imagen_url, thumbnail_url, grid_url, master_url")
    .eq("id", productoId)
    .eq("negocio_id", negocioId)
    .single();

  if (errorLectura || !actual) {
    return { success: false, error: "No se encontró el producto." };
  }

  let mains = parseProductImages(actual.imagen_url);
  let thumbs = parseProductImages(actual.thumbnail_url);
  let grids = parseProductImages(actual.grid_url);
  let masters = parseProductImages(actual.master_url);

  // Las cuatro listas se leen por índice. Una más corta que `mains` (producto
  // viejo sin thumbnails, master que no subió) se rellena con el main, que es
  // el mismo criterio que ya usa el guardado por formulario.
  const alinear = (lista: string[]) =>
    mains.map((main, i) => lista[i] ?? main);
  thumbs = alinear(thumbs);
  grids = alinear(grids);
  masters = mains.map((_, i) => masters[i] ?? "");

  if (cambios.quitar?.length) {
    const fuera = new Set(cambios.quitar);
    const conservar = mains
      .map((url, i) => ({ url, i }))
      .filter(({ url }) => !fuera.has(url));

    mains = conservar.map(({ url }) => url);
    thumbs = conservar.map(({ i }) => thumbs[i]);
    grids = conservar.map(({ i }) => grids[i]);
    masters = conservar.map(({ i }) => masters[i]);
  }

  if (cambios.agregar?.mains?.length) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const nuevas = cambios.agregar;

    // Las URLs las manda el navegador: se verifica que apunten al bucket de
    // ESTE negocio. Mismo criterio que con los precios en create-sale.
    const todasPropias = nuevas.mains.every((_, i) => {
      const master = nuevas.masters?.[i];
      return (
        esUrlImagenPropia(nuevas.mains[i], negocioId, supabaseUrl) &&
        esUrlImagenPropia(nuevas.thumbs?.[i], negocioId, supabaseUrl) &&
        esUrlImagenPropia(nuevas.grids?.[i], negocioId, supabaseUrl) &&
        (master == null ||
          master === "" ||
          esUrlImagenPropia(master, negocioId, supabaseUrl))
      );
    });

    if (!todasPropias) {
      console.error("[FOTOS] URL ajena o inválida, se descarta el agregado.", {
        productoId,
      });
      return { success: false, error: "Las fotos no se pudieron validar." };
    }

    const cupo = Math.max(0, MAX_IMAGENES_PRODUCTO - mains.length);
    if (cupo === 0) {
      return {
        success: false,
        error: `Este producto ya tiene el máximo de ${MAX_IMAGENES_PRODUCTO} fotos.`,
      };
    }

    for (let i = 0; i < Math.min(nuevas.mains.length, cupo); i++) {
      mains.push(nuevas.mains[i]);
      thumbs.push(nuevas.thumbs[i]);
      grids.push(nuevas.grids[i]);
      masters.push(nuevas.masters?.[i] ?? "");
    }
  }

  // `.select("id")` NO es decorativo: sin él, un UPDATE que la RLS filtra
  // devuelve 0 filas y `error: null`, así que esta action retornaba
  // `{ success: true }` y la pantalla decía "Foto guardada" sin haber guardado
  // nada. Pasó de verdad el 5/9/2026: al exigir `stock.editar_producto` para
  // escribir `productos`, las vendedoras subieron 104 fotos a Storage que
  // nunca llegaron a la base, sin un solo error en Vercel. Un permiso que
  // falta tiene que doler acá, no aparecer como éxito.
  const { data: filasTocadas, error: errorUpdate } = await supabase
    .from("productos")
    .update({
      imagen_url: JSON.stringify(mains),
      thumbnail_url: JSON.stringify(thumbs),
      grid_url: JSON.stringify(grids),
      // Igual que en el resto del sistema: si NINGUNA tiene master se guarda
      // null, que distingue "no hay desde dónde regenerar" de una lista de
      // vacíos.
      master_url: masters.some(Boolean) ? JSON.stringify(masters) : null,
    })
    .eq("id", productoId)
    .eq("negocio_id", negocioId)
    .select("id");

  if (errorUpdate) {
    console.error("[FOTOS] No se pudo actualizar la galería", errorUpdate);
    return { success: false, error: "No se pudieron guardar las fotos." };
  }

  if (!filasTocadas || filasTocadas.length === 0) {
    // El producto se leyó recién arriba, así que existe: si el UPDATE no tocó
    // ninguna fila es que la RLS lo filtró — típicamente un permiso que a este
    // usuario le falta. Se dice, en vez de mentir que se guardó.
    console.error("[FOTOS] El UPDATE no afectó ninguna fila", {
      productoId,
      negocioId,
    });
    return {
      success: false,
      error: "No tenés permiso para editar las fotos de este producto.",
    };
  }

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  invalidarCatalogo(negocioId);

  return { success: true, imagenes: mains };
}
