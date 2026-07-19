"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  canonicalizarValores,
  construirCacheAtributos,
} from "@/features/stock/lib/normalize-atributo";
import { parseProductImages } from "@/features/stock/lib/stock-product-utils";
import { buildVariantKey } from "@/features/stock/utils/parse-legacy-variant";

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

export async function editarProductoAction(
  prevState: { error: string | null; success: boolean },
  formData: FormData,
) {
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
  const imagenesAEliminarStr = formData.get("imagenesAEliminar") as
    | string
    | null;
  const imagenesAEliminar: string[] = imagenesAEliminarStr
    ? (JSON.parse(imagenesAEliminarStr) as string[])
    : [];

  if (!id || !nombre || Number.isNaN(precio) || Number.isNaN(precio_costo)) {
    return {
      error: "Por favor completa todos los campos obligatorios.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Subir imágenes nuevas y mergear contra el imagen_url REAL en base.
  // No confiamos en ninguna lista "existente" que pueda mandar el cliente:
  // si el sheet quedó con datos viejos en memoria (otra pestaña, sesión
  // larga, etc.), partir de la base evita pisar imágenes que el cliente
  // ni sabía que estaban. El cliente solo manda qué URLs puntuales quiere
  // borrar (imagenesAEliminar); el resultado final se arma acá.
  let imagen_url: string | undefined = undefined;
  const validFiles = archivos.filter((f) => f.size > 0);
  if (validFiles.length > 0 || imagenesAEliminar.length > 0) {
    const { data: productoActual } = await supabase
      .from("productos")
      .select("imagen_url")
      .eq("id", id)
      .single();

    const imagenesActuales = parseProductImages(productoActual?.imagen_url);

    const urls: string[] = [];
    for (const file of validFiles) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("productos")
        .upload(fileName, file);

      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("productos").getPublicUrl(fileName);
        urls.push(publicUrl);
      }
    }

    const imagenesFinal = imagenesActuales
      .filter((url) => !imagenesAEliminar.includes(url))
      .concat(urls);

    imagen_url = JSON.stringify(imagenesFinal);
  }

  // 2. Actualizar Cabecera de Producto
  const updateData: {
    nombre: string;
    categoria_id: string | null;
    precio: number;
    precio_costo: number;
    descripcion: string;
    publicado: boolean;
    imagen_url?: string;
  } = {
    nombre,
    categoria_id: categoria_id || null,
    precio,
    precio_costo,
    descripcion,
    publicado,
  };

  if (imagen_url !== undefined) updateData.imagen_url = imagen_url;

  const { error: errorProducto } = await supabase
    .from("productos")
    .update(updateData)
    .eq("id", id);

  if (errorProducto) {
    console.error("[EDIT PRODUCT ERROR]", errorProducto);
    return {
      error: "Hubo un error al actualizar el producto base.",
      success: false,
    };
  }

  // 3. Procesar Variantes Editadas
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
          editado_por: user?.id ?? null,
        } satisfies AuditoriaVarianteRow);
      if (auditError) console.error("[EDIT PRODUCT AUDIT ERROR]", auditError);
    } else {
      // Es producto con opciones dinámicas
      const opcionesStr = formData.get("opciones") as string;
      const variantesStr = formData.get("variantes") as string;

      if (opcionesStr && variantesStr) {
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

        // Descartamos propiedades/valores vacíos antes de tocar la base:
        // un nombre en blanco generaría una fila de atributo con slug ""
        // que quedaría reciclándose entre productos distintos.
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

        // Red de seguridad: "Propiedad N"/"Opción N" son los fallbacks que
        // usa el parser de variantes legacy cuando no puede saber el
        // nombre real de una propiedad (ver parse-variant-attributes.ts).
        // Si el formulario de edición los precarga y el vendedor guarda
        // sin renombrarlos, no deben persistirse como si fueran reales.
        const nombreGenerico = opciones.find((op) =>
          /^(propiedad|opci[oó]n)\s*\d*$/i.test(op.nombre),
        );
        if (nombreGenerico) {
          return {
            error: `La propiedad "${nombreGenerico.nombre}" es un nombre genérico auto-generado. Renombrala (ej. "Color", "Talle", "Material") antes de guardar.`,
            success: false,
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
            error:
              "Las variantes no tienen propiedades o valores válidos. Revisa la grilla antes de guardar.",
            success: false,
          };
        }

        // Red de seguridad: el chequeo anterior solo valida que la
        // combinación tenga atributos (Talle, Color, etc.), lo cual es
        // SIEMPRE cierto en un cross-join — no filtra nada por sí solo. La
        // matriz de selección del cliente ya debería mandar solo las
        // combinaciones marcadas, pero si ese estado llega desincronizado
        // por cualquier motivo, no persistimos filas sin ningún dato real
        // cargado (precio, costo, stock o SKU).
        const variantes = variantesConAtributos.filter((v) => {
          const stock = Number.parseInt(v.stock || "0");
          return Boolean(
            v.precio?.trim() ||
              v.precio_costo?.trim() ||
              (Number.isFinite(stock) && stock > 0) ||
              v.sku?.trim(),
          );
        });

        if (variantes.length === 0) {
          return {
            error:
              "Ninguna de las combinaciones tiene precio o stock cargado. Revisá la grilla antes de guardar.",
            success: false,
          };
        }

        // A. Normalizamos cada (propiedad, valor) contra lo que ya existe
        // en atributos/atributo_valores (case/tilde-insensitive vía slug)
        // y cacheamos la forma canónica — "COLOR" y "Color" terminan
        // siendo siempre la misma fila y el mismo string en el JSONB,
        // en vez de lo que se haya tipeado en esta sesión puntual.
        const atributoCache = await construirCacheAtributos(
          supabase,
          opciones,
        );

        // Snapshot de lo que hay ANTES de borrar nada. Nos sirve para dos
        // cosas: (1) si el payload no trae stock explícito para una
        // combinación que ya existía, preservamos su stock real en vez de
        // asumir 0 — el borrado+reinserción de la grilla no debe poder
        // pisar datos que el usuario nunca tocó; y (2) auditar el
        // antes/después de cada variante en esta edición, ya que el DELETE
        // que sigue destruye cualquier evidencia de lo que había.
        const { data: variantesExistentes } = await supabase
          .from("producto_variantes")
          .select("id, nombre_display, atributos, precio, costo, stock")
          .eq("producto_id", id);

        const existentesPorKey = new Map(
          (variantesExistentes ?? []).map((ve) => [
            buildVariantKey((ve.atributos as Record<string, string>) ?? {}),
            ve,
          ]),
        );
        const keysUsadas = new Set<string>();

        // FRENO DE SEGURIDAD: si el payload trae menos combinaciones
        // distintas que las que ya existen en base, hay una variante que
        // el cliente nunca mandó — bloqueamos el guardado en vez de
        // proceder al borrado+reinserción silencioso. Esto no diagnostica
        // la causa (puede ser un problema real de lectura al abrir el
        // sheet, no necesariamente algo que el usuario haya tocado), pero
        // corta cualquier pérdida de datos mientras se investiga.
        const nuevasKeys = new Set(
          variantes.map((v) =>
            buildVariantKey(canonicalizarValores(v.valores, atributoCache)),
          ),
        );
        if (nuevasKeys.size < existentesPorKey.size) {
          const faltantes = existentesPorKey.size - nuevasKeys.size;

          // Dejamos registro forense de EXACTAMENTE qué variante(s) faltaban
          // en el payload — sin esto, la próxima vez que el freno dispare
          // solo sabríamos "algo faltó", no qué combinación puntual ni con
          // qué stock/precio se hubiera perdido. El guardado no se aplica
          // (return antes del DELETE), así que esto es pura evidencia.
          const auditoriaBloqueo: AuditoriaVarianteRow[] = [];
          for (const [key, existente] of existentesPorKey) {
            if (nuevasKeys.has(key)) continue;
            auditoriaBloqueo.push({
              producto_id: id,
              variante_id_anterior: existente.id,
              variante_id_nueva: null,
              atributos: (existente.atributos as Record<string, string>) ?? {},
              nombre_display: existente.nombre_display,
              accion: "BLOQUEADO_FALTANTE",
              stock_anterior: existente.stock,
              stock_nuevo: null,
              precio_anterior: existente.precio,
              precio_nuevo: null,
              costo_anterior: existente.costo,
              costo_nuevo: null,
              editado_por: user?.id ?? null,
            });
          }
          const { error: auditBloqueoError } = await supabase
            .from("producto_variantes_auditoria")
            .insert(auditoriaBloqueo);
          if (auditBloqueoError)
            console.error(
              "[EDIT PRODUCT AUDIT BLOQUEO ERROR]",
              auditBloqueoError,
            );

          return {
            error:
              `Guardado bloqueado: se detectaron ${faltantes} variante(s) menos que las que ya existen para este producto. ` +
              `Esto puede borrar stock real sin que lo hayas pedido. Si de verdad querés eliminar una combinación, ` +
              `avisá al equipo técnico — por ahora este guardado no la va a tocar.`,
            success: false,
          };
        }

        // Borramos variantes viejas para refrescar la grilla limpia
        const { error: delVarError } = await supabase
          .from("producto_variantes")
          .delete()
          .eq("producto_id", id);
        if (delVarError) throw delVarError;

        const { error: delStockError } = await supabase
          .from("productos_stock")
          .delete()
          .eq("producto_id", id); // legacy
        if (delStockError) throw delStockError;

        const auditoria: AuditoriaVarianteRow[] = [];

        // B. Guardar las Variantes nuevas, con atributos ya canonicalizados
        for (const v of variantes) {
          const valoresCanonicos = canonicalizarValores(
            v.valores,
            atributoCache,
          );

          const varKey = buildVariantKey(valoresCanonicos);
          const existente = existentesPorKey.get(varKey);
          if (existente) keysUsadas.add(varKey);

          const nombreDisplay = opciones
            .map(
              (op) =>
                valoresCanonicos[
                  atributoCache[op.nombre]?.nombreCanonico ?? op.nombre
                ],
            )
            .filter(Boolean)
            .join(" / ");

          const vPrecio = v.precio ? Number.parseFloat(v.precio) : null;
          const vCosto = v.precio_costo
            ? Number.parseFloat(v.precio_costo)
            : null;
          // Si el payload no trae stock (vacío/undefined) y la combinación
          // ya existía, preservamos su stock real en vez de asumir 0.
          const stockInput = v.stock?.trim();
          const vStock = stockInput
            ? Number.parseInt(stockInput)
            : (existente?.stock ?? 0);

          const { data: varData, error: varInsertError } = await supabase
            .from("producto_variantes")
            .insert({
              producto_id: id,
              nombre_display: nombreDisplay,
              atributos: valoresCanonicos,
              precio: vPrecio,
              costo: vCosto,
              stock: vStock,
              sku: v.sku || null,
            })
            .select("id")
            .single();
          if (varInsertError) throw varInsertError;

          auditoria.push({
            producto_id: id,
            variante_id_anterior: existente?.id ?? null,
            variante_id_nueva: varData?.id ?? null,
            atributos: valoresCanonicos,
            nombre_display: nombreDisplay,
            accion: existente ? "ACTUALIZADA" : "CREADA",
            stock_anterior: existente?.stock ?? null,
            stock_nuevo: vStock,
            precio_anterior: existente?.precio ?? null,
            precio_nuevo: vPrecio,
            costo_anterior: existente?.costo ?? null,
            costo_nuevo: vCosto,
            editado_por: user?.id ?? null,
          });

          if (varData) {
            const varValores = [];
            for (const [opNombre, opValor] of Object.entries(v.valores)) {
              const entry = atributoCache[opNombre];
              const valorEntry = entry?.valores[opValor as string];
              if (entry && valorEntry) {
                varValores.push({
                  variante_id: varData.id,
                  atributo_id: entry.atributoId,
                  atributo_valor_id: valorEntry.valorId,
                });
              }
            }
            if (varValores.length > 0) {
              const { error: varValoresError } = await supabase
                .from("producto_variante_valores")
                .insert(varValores);
              if (varValoresError) throw varValoresError;
            }
          }

          // Legacy support
          const { error: stockInsertError } = await supabase
            .from("productos_stock")
            .insert({
              producto_id: id,
              variante: nombreDisplay,
              cantidad: vStock,
            });
          if (stockInsertError) throw stockInsertError;
        }

        // Combinaciones que existían y no vinieron en este guardado (el
        // usuario las destildó de la matriz, o dejaron de matchear): se
        // borran de verdad, pero dejamos registro de qué tenían antes.
        for (const [key, existente] of existentesPorKey) {
          if (keysUsadas.has(key)) continue;
          auditoria.push({
            producto_id: id,
            variante_id_anterior: existente.id,
            variante_id_nueva: null,
            atributos: (existente.atributos as Record<string, string>) ?? {},
            nombre_display: existente.nombre_display,
            accion: "ELIMINADA",
            stock_anterior: existente.stock,
            stock_nuevo: null,
            precio_anterior: existente.precio,
            precio_nuevo: null,
            costo_anterior: existente.costo,
            costo_nuevo: null,
            editado_por: user?.id ?? null,
          });
        }

        if (auditoria.length > 0) {
          const { error: auditError } = await supabase
            .from("producto_variantes_auditoria")
            .insert(auditoria);
          if (auditError)
            console.error("[EDIT PRODUCT AUDIT ERROR]", auditError);
        }
      }
    }
  } catch (error) {
    console.error("[EDIT PRODUCT ERROR]", error);

    const pgError = error as { code?: string; message?: string };

    if (pgError?.code === "42501") {
      return {
        error:
          "No tenés permisos para guardar estos cambios (política de seguridad RLS).",
        success: false,
      };
    }
    if (pgError?.code === "23503") {
      return {
        error:
          "Alguno de los datos hace referencia a un registro que ya no existe (violación de clave foránea).",
        success: false,
      };
    }

    return {
      error: "Hubo un error al guardar las variantes del producto.",
      success: false,
    };
  }

  revalidatePath("/stock");
  revalidatePath("/store");

  return { error: null, success: true };
}
