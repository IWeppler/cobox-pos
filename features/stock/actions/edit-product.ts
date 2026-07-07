"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  canonicalizarValores,
  construirCacheAtributos,
} from "@/features/stock/lib/normalize-atributo";

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

  if (!id || !nombre || Number.isNaN(precio) || Number.isNaN(precio_costo)) {
    return {
      error: "Por favor completa todos los campos obligatorios.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Subir imágenes si hay nuevas
  let imagen_url: string | undefined = undefined;
  const validFiles = archivos.filter((f) => f.size > 0);
  if (validFiles.length > 0) {
    const urls = [];
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
    if (urls.length > 0) {
      imagen_url = JSON.stringify(urls);
    }
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
      const { error: delVarError } = await supabase
        .from("producto_variantes")
        .delete()
        .eq("producto_id", id);
      if (delVarError) throw delVarError;

      const { error: insVarError } = await supabase
        .from("producto_variantes")
        .insert({
          producto_id: id,
          nombre_display: "Único",
          stock: stockBase,
        });
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

        // B. Guardar las Variantes nuevas, con atributos ya canonicalizados
        for (const v of variantes) {
          const valoresCanonicos = canonicalizarValores(
            v.valores,
            atributoCache,
          );

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
          const vStock = Number.parseInt(v.stock || "0");

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
