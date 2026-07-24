"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  canonicalizarValores,
  construirCacheAtributos,
} from "@/features/stock/lib/normalize-atributo";
import { parseProductImages } from "@/features/stock/lib/stock-product-utils";

type SupabaseServerClient = ReturnType<typeof createClient>;

type AuditoriaVarianteRow = {
  producto_id: string;
  variante_id_anterior: string | null;
  variante_id_nueva: string | null;
  atributos: Record<string, string>;
  nombre_display: string | null;
  accion: "CREADA" | "ACTUALIZADA" | "ELIMINADA" | "BLOQUEADO_FALTANTE";
  stock_anterior: number | null;
  stock_nuevo: number | null;
  precio_anterior: number | null;
  precio_nuevo: number | null;
  costo_anterior: number | null;
  costo_nuevo: number | null;
  editado_por: string | null;
};

export type ImagenesResult = {
  success: boolean;
  error?: string;
  // Presente solo si de verdad se recalcularon (hubo archivos nuevos o
  // borrados) — el cliente lo usa para sincronizar su estado local y no
  // volver a subir los mismos binarios en un reintento (ver EditProductForm).
  urls?: {
    imagen_url?: string;
    thumbnail_url?: string;
    grid_url?: string;
  };
};

export type VariantesResult = {
  success: boolean;
  error?: string;
};

export type EditarProductoResult = {
  imagenes: ImagenesResult;
  variantes: VariantesResult;
};

// Fotos y variantes son preocupaciones independientes: el guard de
// variantes (paso 2) nunca debe poder bloquear un cambio de imágenes
// (paso 1), y viceversa. Cada una corre y responde por su cuenta — no hay
// un booleano combinado que esconda un éxito parcial.
export async function editarProductoAction(
  prevState: EditarProductoResult,
  formData: FormData,
): Promise<EditarProductoResult> {
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;
  const categoria_id = formData.get("categoria_id") as string;
  const descripcion = formData.get("descripcion") as string;
  const precio = Number.parseFloat(formData.get("precio") as string);
  const precio_costo = Number.parseFloat(
    formData.get("precio_costo") as string,
  );
  const publicado = formData.get("publicado") === "true";

  const tieneVariantes = formData.get("tieneVariantes") === "true";
  const stockBase = Number.parseInt(
    (formData.get("stockBase") as string) || "0",
  );

  const archivos = formData.getAll("imagenes") as File[];
  const thumbnails = formData.getAll("thumbnails") as File[];
  const grids = formData.getAll("grids") as File[];
  const imagenesAEliminarStr = formData.get("imagenesAEliminar") as
    | string
    | null;
  const imagenesAEliminar: string[] = imagenesAEliminarStr
    ? (JSON.parse(imagenesAEliminarStr) as string[])
    : [];

  if (!id || !nombre || Number.isNaN(precio) || Number.isNaN(precio_costo)) {
    const error = "Por favor completa todos los campos obligatorios.";
    return {
      imagenes: { success: false, error },
      variantes: { success: false, error },
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // (a) Imágenes + cabecera del producto — corre siempre, sin importar lo
  // que pase con las variantes.
  const imagenes = await actualizarImagenesYCabecera(supabase, {
    id,
    nombre,
    categoria_id,
    descripcion,
    precio,
    precio_costo,
    publicado,
    archivos,
    thumbnails,
    grids,
    imagenesAEliminar,
  });

  // (b) Variantes, con su guard intacto — corre después, y su resultado
  // no revierte ni condiciona lo que (a) ya haya guardado.
  const variantes = await procesarVariantes(supabase, {
    id,
    tieneVariantes,
    stockBase,
    formData,
    userId: user?.id ?? null,
  });

  revalidatePath("/stock");
  revalidatePath("/store");

  return { imagenes, variantes };
}

async function actualizarImagenesYCabecera(
  supabase: SupabaseServerClient,
  params: {
    id: string;
    nombre: string;
    categoria_id: string;
    descripcion: string;
    precio: number;
    precio_costo: number;
    publicado: boolean;
    archivos: File[];
    thumbnails: File[];
    grids: File[];
    imagenesAEliminar: string[];
  },
): Promise<ImagenesResult> {
  const {
    id,
    nombre,
    categoria_id,
    descripcion,
    precio,
    precio_costo,
    publicado,
    archivos,
    thumbnails,
    grids,
    imagenesAEliminar,
  } = params;

  // Subir imágenes nuevas y mergear contra el imagen_url REAL en base. No
  // confiamos en ninguna lista "existente" que pueda mandar el cliente: si
  // el sheet quedó con datos viejos en memoria (otra pestaña, sesión
  // larga, etc.), partir de la base evita pisar imágenes que el cliente ni
  // sabía que estaban. El cliente solo manda qué URLs puntuales quiere
  // borrar (imagenesAEliminar); el resultado final se arma acá.
  let imagen_url: string | undefined = undefined;
  let thumbnail_url: string | undefined = undefined;
  let grid_url: string | undefined = undefined;
  const validFiles = archivos.filter((f) => f.size > 0);
  if (validFiles.length > 0 || imagenesAEliminar.length > 0) {
    const { data: productoActual } = await supabase
      .from("productos")
      .select("imagen_url, thumbnail_url, grid_url")
      .eq("id", id)
      .single();

    const imagenesActuales = parseProductImages(productoActual?.imagen_url);
    const thumbnailsActuales = parseProductImages(
      productoActual?.thumbnail_url,
    );
    const gridsActuales = parseProductImages(productoActual?.grid_url);

    const urls: string[] = [];
    const urlsThumb: string[] = [];
    const urlsGrid: string[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const fileExt = file.name.split(".").pop();
      const baseFileName = crypto.randomUUID();
      const fileName = `${baseFileName}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("productos")
        .upload(fileName, file, { cacheControl: "31536000" });

      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("productos").getPublicUrl(fileName);
        urls.push(publicUrl);
      }

      // El thumbnail y el grid viajan en el mismo índice que su main (ver
      // optimizarImagenProducto en edit-sheet.tsx). Si no vinieron, no
      // bloqueamos la subida del main por eso.
      const thumb = thumbnails[i];
      if (thumb && thumb.size > 0) {
        const thumbExt = thumb.name.split(".").pop();
        const thumbName = `thumbs/${baseFileName}-thumb.${thumbExt}`;
        const { error: uploadThumbError } = await supabase.storage
          .from("productos")
          .upload(thumbName, thumb, { cacheControl: "31536000" });
        if (!uploadThumbError) {
          const {
            data: { publicUrl: thumbUrl },
          } = supabase.storage.from("productos").getPublicUrl(thumbName);
          urlsThumb.push(thumbUrl);
        } else {
          console.error("[EDIT PRODUCT THUMBNAIL ERROR]", uploadThumbError);
        }
      } else if (!uploadError) {
        console.warn(
          `[EDIT PRODUCT] Sin thumbnail para la imagen ${i} (archivo "${file.name}") — se sube igual el main.`,
        );
      }

      const grid = grids[i];
      if (grid && grid.size > 0) {
        const gridExt = grid.name.split(".").pop();
        const gridName = `grids/${baseFileName}-grid.${gridExt}`;
        const { error: uploadGridError } = await supabase.storage
          .from("productos")
          .upload(gridName, grid, { cacheControl: "31536000" });
        if (!uploadGridError) {
          const {
            data: { publicUrl: gridUrl },
          } = supabase.storage.from("productos").getPublicUrl(gridName);
          urlsGrid.push(gridUrl);
        } else {
          console.error("[EDIT PRODUCT GRID ERROR]", uploadGridError);
        }
      } else if (!uploadError) {
        console.warn(
          `[EDIT PRODUCT] Sin grid para la imagen ${i} (archivo "${file.name}") — se sube igual el main.`,
        );
      }
    }

    // imagenesAEliminar llega como URLs de imagen_url (lo único que ve el
    // usuario en el sheet) — recorremos por índice para descartar el
    // thumbnail/grid correspondiente en el mismo lugar del array y no
    // desalinear las listas. Si una imagen vieja no tiene thumbnail o grid
    // propio (productos creados antes de este cambio, o aún no
    // backfilleados), usamos su propia imagen_url como placeholder en vez
    // de dejar el índice vacío — se reemplaza solo cuando corra el backfill.
    const imagenesFinal: string[] = [];
    const thumbnailsFinal: string[] = [];
    const gridsFinal: string[] = [];
    imagenesActuales.forEach((url, idx) => {
      if (imagenesAEliminar.includes(url)) return;
      imagenesFinal.push(url);
      thumbnailsFinal.push(thumbnailsActuales[idx] ?? url);
      gridsFinal.push(gridsActuales[idx] ?? url);
    });

    imagen_url = JSON.stringify(imagenesFinal.concat(urls));
    thumbnail_url = JSON.stringify(thumbnailsFinal.concat(urlsThumb));
    grid_url = JSON.stringify(gridsFinal.concat(urlsGrid));
  }

  const updateData: {
    nombre: string;
    categoria_id: string | null;
    precio: number;
    precio_costo: number;
    descripcion: string;
    publicado: boolean;
    imagen_url?: string;
    thumbnail_url?: string;
    grid_url?: string;
  } = {
    nombre,
    categoria_id: categoria_id || null,
    precio,
    precio_costo,
    descripcion,
    publicado,
  };

  if (imagen_url !== undefined) updateData.imagen_url = imagen_url;
  if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
  if (grid_url !== undefined) updateData.grid_url = grid_url;

  const { error: errorProducto } = await supabase
    .from("productos")
    .update(updateData)
    .eq("id", id);

  if (errorProducto) {
    console.error("[EDIT PRODUCT ERROR]", errorProducto);
    return {
      success: false,
      error: "Hubo un error al actualizar el producto base.",
    };
  }

  return { success: true, urls: { imagen_url, thumbnail_url, grid_url } };
}

async function procesarVariantes(
  supabase: SupabaseServerClient,
  params: {
    id: string;
    tieneVariantes: boolean;
    stockBase: number;
    formData: FormData;
    userId: string | null;
  },
): Promise<VariantesResult> {
  const { id, tieneVariantes, stockBase, formData, userId } = params;

  try {
    if (!tieneVariantes) {
      const { data: unicoAnterior } = await supabase
        .from("producto_variantes")
        .select("id, stock, precio, costo")
        .eq("producto_id", id)
        .maybeSingle();

      const { error: delVarError } = await supabase
        .from("producto_variantes")
        .delete()
        .eq("producto_id", id);
      if (delVarError) throw delVarError;

      const { data: unicoNuevo, error: insVarError } = await supabase
        .from("producto_variantes")
        .insert({
          producto_id: id,
          nombre_display: "Único",
          stock: stockBase,
        })
        .select("id")
        .single();
      if (insVarError) throw insVarError;

      // Legacy support
      const { error: delStockError } = await supabase
        .from("productos_stock")
        .delete()
        .eq("producto_id", id);
      if (delStockError) throw delStockError;

      const { error: insStockError } = await supabase
        .from("productos_stock")
        .insert({ producto_id: id, variante: "Único", cantidad: stockBase });
      if (insStockError) throw insStockError;

      const { error: auditError } = await supabase
        .from("producto_variantes_auditoria")
        .insert({
          producto_id: id,
          variante_id_anterior: unicoAnterior?.id ?? null,
          variante_id_nueva: unicoNuevo?.id ?? null,
          atributos: {},
          nombre_display: "Único",
          accion: unicoAnterior ? "ACTUALIZADA" : "CREADA",
          stock_anterior: unicoAnterior?.stock ?? null,
          stock_nuevo: stockBase,
          precio_anterior: unicoAnterior?.precio ?? null,
          precio_nuevo: null,
          costo_anterior: unicoAnterior?.costo ?? null,
          costo_nuevo: null,
          editado_por: userId,
        } satisfies AuditoriaVarianteRow);
      if (auditError) console.error("[EDIT PRODUCT AUDIT ERROR]", auditError);

      return { success: true };
    }

    // Es producto con opciones dinámicas
    const opcionesStr = formData.get("opciones") as string;
    const variantesStr = formData.get("variantes") as string;

    if (!opcionesStr || !variantesStr) {
      // Nada que procesar del lado de variantes — no es un error.
      return { success: true };
    }

    const opcionesRaw = JSON.parse(opcionesStr) as {
      nombre: string;
      valores: string[];
    }[];
    const variantesRaw = JSON.parse(variantesStr) as {
      valores: Record<string, string>;
      precio?: string;
      precio_costo?: string;
      stock?: string;
      sku?: string;
    }[];

    // Descartamos propiedades/valores vacíos antes de tocar la base: un
    // nombre en blanco generaría una fila de atributo con slug "" que
    // quedaría reciclándose entre productos distintos.
    const opciones = opcionesRaw
      .map((op) => ({
        nombre: op.nombre?.trim(),
        valores: (op.valores ?? [])
          .map((v) => v?.trim())
          .filter((v): v is string => Boolean(v)),
      }))
      .filter(
        (op): op is { nombre: string; valores: string[] } =>
          Boolean(op.nombre) && op.valores.length > 0,
      );

    // Red de seguridad: "Propiedad N"/"Opción N" son los fallbacks que usa
    // el parser de variantes legacy cuando no puede saber el nombre real
    // de una propiedad (ver parse-variant-attributes.ts). Si el
    // formulario de edición los precarga y el vendedor guarda sin
    // renombrarlos, no deben persistirse como si fueran reales.
    const nombreGenerico = opciones.find((op) =>
      /^(propiedad|opci[oó]n)\s*\d*$/i.test(op.nombre),
    );
    if (nombreGenerico) {
      return {
        success: false,
        error: `La propiedad "${nombreGenerico.nombre}" es un nombre genérico auto-generado. Renombrala (ej. "Color", "Talle", "Material") antes de guardar.`,
      };
    }

    const variantesConAtributos = variantesRaw.filter(
      (v) =>
        v.valores &&
        Object.entries(v.valores).some(
          ([k, val]) => k.trim() && val?.trim(),
        ),
    );

    if (opciones.length === 0 || variantesConAtributos.length === 0) {
      return {
        success: false,
        error:
          "Las variantes no tienen propiedades o valores válidos. Revisa la grilla antes de guardar.",
      };
    }

    // Red de seguridad: el chequeo anterior solo valida que la combinación
    // tenga atributos (Talle, Color, etc.), lo cual es SIEMPRE cierto en
    // un cross-join — no filtra nada por sí solo. La matriz de selección
    // del cliente ya debería mandar solo las combinaciones marcadas, pero
    // si ese estado llega desincronizado por cualquier motivo, no
    // persistimos filas sin NINGÚN dato real cargado. Importante: "stock
    // en 0" SÍ es un dato real (una variante agotada, ya existente, que
    // hereda precio/costo del producto padre) — el chequeo mira si el
    // campo vino provisto, no si el valor es mayor a cero. Antes acá
    // stock=0 se trataba como "sin datos" y la fila se descartaba del
    // payload, lo que hacía que el guard de la RPC bloqueara SIEMPRE que
    // el producto tuviera una variante agotada sin override propio —
    // aunque el usuario ni hubiera tocado esa combinación.
    const variantes = variantesConAtributos.filter((v) => {
      const stockProvisto =
        v.stock !== undefined && v.stock !== null && v.stock.trim() !== "";
      return Boolean(
        v.precio?.trim() || v.precio_costo?.trim() || stockProvisto || v.sku?.trim(),
      );
    });

    if (variantes.length === 0) {
      return {
        success: false,
        error:
          "Ninguna de las combinaciones tiene precio o stock cargado. Revisá la grilla antes de guardar.",
      };
    }

    // A. Normalizamos cada (propiedad, valor) contra lo que ya existe en
    // atributos/atributo_valores (case/tilde-insensitive vía slug) y
    // cacheamos la forma canónica — "COLOR" y "Color" terminan siendo
    // siempre la misma fila y el mismo string en el JSONB, en vez de lo
    // que se haya tipeado en esta sesión puntual.
    const atributoCache = await construirCacheAtributos(supabase, opciones);

    // B. Armamos el payload con atributos ya canonicalizados y lo mandamos
    // entero al RPC guardar_variantes_producto, que corre el chequeo de
    // seguridad + delete + reinsert + relaciones + stock legacy +
    // auditoría como UNA sola transacción de Postgres: si el chequeo
    // bloquea, el DELETE nunca se ejecuta; si algo falla a mitad de
    // camino, Postgres revierte todo — no puede quedar a medio aplicar
    // como con la secuencia de llamadas sueltas de antes.
    const rpcPayload = variantes.map((v) => {
      const valoresCanonicos = canonicalizarValores(v.valores, atributoCache);

      const nombreDisplay = opciones
        .map(
          (op) =>
            valoresCanonicos[
              atributoCache[op.nombre]?.nombreCanonico ?? op.nombre
            ],
        )
        .filter(Boolean)
        .join(" / ");

      const relaciones = Object.entries(v.valores).flatMap(
        ([opNombre, opValor]) => {
          const entry = atributoCache[opNombre];
          const valorEntry = entry?.valores[opValor as string];
          return entry && valorEntry
            ? [
                {
                  atributo_id: entry.atributoId,
                  atributo_valor_id: valorEntry.valorId,
                },
              ]
            : [];
        },
      );

      return {
        atributos: valoresCanonicos,
        nombre_display: nombreDisplay,
        precio: v.precio ? Number.parseFloat(v.precio) : null,
        costo: v.precio_costo ? Number.parseFloat(v.precio_costo) : null,
        stock_input: v.stock?.trim() || null,
        sku: v.sku || null,
        relaciones,
      };
    });

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "guardar_variantes_producto",
      {
        p_producto_id: id,
        p_variantes: rpcPayload,
        p_editado_por: userId,
      },
    );
    if (rpcError) throw rpcError;

    const resultado = rpcResult as {
      success: boolean;
      blocked?: boolean;
      faltantes?: number;
    };

    if (!resultado.success) {
      return {
        success: false,
        error:
          `Guardado bloqueado: se detectaron ${resultado.faltantes} variante(s) menos que las que ya existen para este producto. ` +
          `Esto puede borrar stock real sin que lo hayas pedido. Si de verdad querés eliminar una combinación, ` +
          `avisá al equipo técnico — por ahora este guardado no la va a tocar.`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[EDIT PRODUCT ERROR]", error);

    const pgError = error as { code?: string; message?: string };

    if (pgError?.code === "42501") {
      return {
        success: false,
        error:
          "No tenés permisos para guardar estos cambios (política de seguridad RLS).",
      };
    }
    if (pgError?.code === "23503") {
      return {
        success: false,
        error:
          "Alguno de los datos hace referencia a un registro que ya no existe (violación de clave foránea).",
      };
    }

    return {
      success: false,
      error: "Hubo un error al guardar las variantes del producto.",
    };
  }
}
