"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  canonicalizarValores,
  construirCacheAtributos,
} from "@/features/stock/lib/normalize-atributo";
import { parseProductImages } from "@/features/stock/lib/stock-product-utils";
import { obtenerAtributosRequeridosFaltantes } from "@/features/stock/lib/validate-required-atributos";
import { subirImagenesProducto } from "@/features/stock/lib/subir-imagenes-producto";
import { MAX_IMAGENES_PRODUCTO } from "@/shared/utils/limites-imagen";
import {
  normalizarTratamientoIva,
  normalizarUnidadMedida,
} from "@/shared/lib/fiscal-producto";

type SupabaseServerClient = ReturnType<typeof createClient>;

type AuditoriaVarianteRow = {
  negocio_id: string;
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

  if (!user) {
    const error = "No se pudo verificar la sesión del usuario.";
    return {
      imagenes: { success: false, error },
      variantes: { success: false, error },
    };
  }

  // MULTI-TENANT: NEGOCIO ACTIVO DE LA SESIÓN
  // No sale de perfiles.negocio_id: esa columna quedó deprecada, es NULL para
  // todo usuario invitado y apunta al negocio viejo de quien trabaja en dos.
  // =========================================================================
  const { data: negocioId, error: negocioError } =
    await supabase.rpc("negocio_actual");

  if (negocioError || !negocioId) {
    const error = "No hay un negocio activo en esta sesión.";
    return {
      imagenes: { success: false, error },
      variantes: { success: false, error },
    };
  }

  // Identidad y datos fiscales: SOLO se pisan los que el formulario mandó.
  // `has()` y no `get()` porque un campo ausente y uno vacío son cosas
  // distintas — el bloque fiscal va colapsado y cuando está cerrado no monta
  // sus inputs. Con `get()`, un producto al 10,5% volvería al default 21%
  // cada vez que alguien le corrige el precio. Es el mismo error que borraba
  // los datos fiscales de un cliente al guardar sin tocar el toggle.
  const camposOpcionales: Record<string, string | null> = {};
  if (formData.has("marca")) {
    camposOpcionales.marca =
      (formData.get("marca") as string)?.trim() || null;
  }
  if (formData.has("genero")) {
    camposOpcionales.genero =
      (formData.get("genero") as string)?.trim() || null;
  }
  if (formData.has("tratamiento_iva")) {
    camposOpcionales.tratamiento_iva = normalizarTratamientoIva(
      formData.get("tratamiento_iva"),
    );
  }
  if (formData.has("unidad_medida")) {
    camposOpcionales.unidad_medida = normalizarUnidadMedida(
      formData.get("unidad_medida"),
    );
  }

  // (a) Imágenes + cabecera del producto — corre siempre, sin importar lo
  // que pase con las variantes.
  const imagenes = await actualizarImagenesYCabecera(supabase, {
    id,
    negocioId,
    camposOpcionales,
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
    negocioId,
    categoria_id: categoria_id || null,
    tieneVariantes,
    stockBase,
    formData,
    userId: user?.id ?? null,
  });

  revalidatePath("/stock");
  revalidatePath("/store", "layout");

  return { imagenes, variantes };
}

async function actualizarImagenesYCabecera(
  supabase: SupabaseServerClient,
  params: {
    id: string;
    negocioId: string;
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
    /** Columnas de cabecera que solo se tocan si el form las mandó. */
    camposOpcionales: Record<string, string | null>;
  },
): Promise<ImagenesResult> {
  const {
    id,
    negocioId,
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
    camposOpcionales,
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
  const hayArchivosNuevos = archivos.some((f) => f.size > 0);
  if (hayArchivosNuevos || imagenesAEliminar.length > 0) {
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

    // imagenesAEliminar llega como URLs de imagen_url (lo único que ve el
    // usuario en el sheet) — recorremos por índice para descartar el
    // thumbnail/grid correspondiente en el mismo lugar del array y no
    // desalinear las listas. Si una imagen vieja no tiene thumbnail o grid
    // propio (productos creados antes de este cambio, o aún no
    // backfilleados), usamos su propia imagen_url como placeholder en vez
    // de dejar el índice vacío — se reemplaza solo cuando corra el backfill.
    //
    // Va ANTES de subir las nuevas porque de acá sale cuántas entran: el tope
    // de MAX_IMAGENES_PRODUCTO cuenta las que quedan más las que se agregan.
    const imagenesFinal: string[] = [];
    const thumbnailsFinal: string[] = [];
    const gridsFinal: string[] = [];
    imagenesActuales.forEach((url, idx) => {
      if (imagenesAEliminar.includes(url)) return;
      imagenesFinal.push(url);
      thumbnailsFinal.push(thumbnailsActuales[idx] ?? url);
      gridsFinal.push(gridsActuales[idx] ?? url);
    });

    // El tope NO es retroactivo: un producto viejo con 5 fotos conserva las 5.
    // Lo único que pasa es que el cupo da 0 y no se le puede sumar ninguna.
    const cupoDisponible = Math.max(
      0,
      MAX_IMAGENES_PRODUCTO - imagenesFinal.length,
    );

    // El thumbnail y el grid viajan en el mismo índice que su main (ver
    // optimizarImagenesProducto en edit-sheet.tsx). subirImagenesProducto
    // garantiza que las tres listas salgan alineadas y del mismo largo.
    const {
      mains: urls,
      thumbs: urlsThumb,
      grids: urlsGrid,
    } = hayArchivosNuevos
      ? await subirImagenesProducto(
          supabase,
          negocioId,
          archivos,
          thumbnails,
          grids,
          "EDIT PRODUCT",
          cupoDisponible,
        )
      : { mains: [], thumbs: [], grids: [] };

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
    // Identidad y datos fiscales: solo los que el formulario mandó (ver
    // `camposOpcionales` en editarProductoAction).
    ...camposOpcionales,
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
    negocioId: string;
    categoria_id: string | null;
    tieneVariantes: boolean;
    stockBase: number;
    formData: FormData;
    userId: string | null;
  },
): Promise<VariantesResult> {
  const { id, negocioId, categoria_id, tieneVariantes, stockBase, formData, userId } =
    params;

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
          negocio_id: negocioId,
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
        .insert({ producto_id: id, variante: "Único", cantidad: stockBase, negocio_id: negocioId });
      if (insStockError) throw insStockError;

      const { error: auditError } = await supabase
        .from("producto_variantes_auditoria")
        .insert({
          negocio_id: negocioId,
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

    // Espejo server-side de useVariantSelection: si la categoría exige
    // atributos (categoria_atributos) que no tienen valor cargado acá, no
    // confiamos en que el cliente ya lo haya validado.
    const atributosFaltantes = await obtenerAtributosRequeridosFaltantes(
      supabase,
      categoria_id,
      opciones,
    );
    if (atributosFaltantes.length > 0) {
      return {
        success: false,
        error: `Esta categoría exige el/los atributo(s) "${atributosFaltantes.join('", "')}" — completalos antes de guardar.`,
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

    // Lo que el usuario ya vio y confirmó explícitamente en el modal de
    // confirmación (ConfirmSaveVariantsModal) — la RPC solo deja pasar
    // faltantes que estén en esta lista; cualquier otra sigue bloqueando
    // el guardado igual que antes.
    const confirmadasEliminarStr = formData.get(
      "confirmadasEliminar",
    ) as string | null;
    const confirmadasEliminar = confirmadasEliminarStr
      ? (JSON.parse(confirmadasEliminarStr) as Record<string, string>[])
      : [];

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "guardar_variantes_producto",
      {
        p_producto_id: id,
        p_negocio_id: negocioId,
        p_variantes: rpcPayload,
        p_editado_por: userId,
        p_confirmadas_eliminar: confirmadasEliminar,
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
          `Guardado bloqueado: se detectaron ${resultado.faltantes} variante(s) que iban a desaparecer sin haber sido confirmadas en el paso anterior. ` +
          `Esto puede borrar stock real sin que lo hayas pedido — cerrá este cambio, volvé a abrir el producto y confirmá de nuevo. ` +
          `Si el mensaje persiste después de eso, avisá al equipo técnico.`,
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
