"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { slugify } from "@/shared/utils/slugify";
import {
  canonicalizarValores,
  construirCacheAtributos,
} from "@/features/stock/lib/normalize-atributo";

export async function crearProductoAction(
  prevState: { error: string | null; success: boolean },
  formData: FormData,
) {
  const nombre = formData.get("nombre") as string;
  const categoria_id = formData.get("categoria_id") as string;
  const descripcion = formData.get("descripcion") as string;
  const precio = Number.parseFloat(formData.get("precio") as string);
  const precio_costo = Number.parseFloat(
    formData.get("precio_costo") as string,
  );

  const tieneVariantes = formData.get("tieneVariantes") === "true";
  const stockBase = Number.parseInt(
    (formData.get("stockBase") as string) || "0",
  );

  const archivos = formData.getAll("imagenes") as File[];

  if (!nombre || Number.isNaN(precio) || Number.isNaN(precio_costo)) {
    return {
      error: "Por favor completa los campos básicos obligatorios.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Fallback temporal para la columna "tipo" vieja
  let tipo = "Interior";
  if (categoria_id) {
    const { data: cat } = await supabase
      .from("categorias")
      .select("nombre")
      .eq("id", categoria_id)
      .single();
    if (cat) tipo = cat.nombre;
  }

  // 1. Subir imágenes
  let imagen_url = null;
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
    if (urls.length > 0) imagen_url = JSON.stringify(urls);
  }

  let slug = slugify(`${nombre}-${tipo}`);
  const sufijo = Math.random().toString(36).substring(2, 6);
  slug = `${slug}-${sufijo}`;

  // 2. Insertar Cabecera de Producto
  const { data: nuevoProducto, error: errorProducto } = await supabase
    .from("productos")
    .insert({
      nombre,
      tipo, // Fallback legacy
      categoria_id: categoria_id || null,
      descripcion,
      precio,
      precio_costo,
      imagen_url,
      slug,
      publicado: true,
      atributos_globales: {},
    })
    .select("id")
    .single();

  if (errorProducto || !nuevoProducto) {
    console.error(errorProducto);
    return {
      error: "Hubo un error al crear el producto base.",
      success: false,
    };
  }

  // 3. Procesar Opciones y Variantes
  if (!tieneVariantes) {
    // Si es un producto simple, creamos una variante "Única" invisible
    await supabase.from("producto_variantes").insert({
      producto_id: nuevoProducto.id,
      nombre_display: "Único",
      atributos: {},
      precio: null, // Hereda del padre
      costo: null, // Hereda del padre
      stock: stockBase,
    });

    // Mantenemos legacy stock table para no romper la app vieja
    await supabase.from("productos_stock").insert({
      producto_id: nuevoProducto.id,
      variante: "Único",
      cantidad: stockBase,
    });

    revalidatePath("/stock");
    revalidatePath("/store");
    return { error: null, success: true };
  }

  // Producto con opciones dinámicas
  try {
    const opcionesStr = formData.get("opciones") as string;
    const variantesStr = formData.get("variantes") as string;

    if (!opcionesStr || !variantesStr) {
      revalidatePath("/stock");
      revalidatePath("/store");
      return { error: null, success: true };
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

    // Mismo saneamiento que editarProductoAction: descartamos propiedades
    // o valores vacíos antes de tocar la base.
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

    const nombreGenerico = opciones.find((op) =>
      /^(propiedad|opci[oó]n)\s*\d*$/i.test(op.nombre),
    );
    if (nombreGenerico) {
      return {
        error: `La propiedad "${nombreGenerico.nombre}" es un nombre genérico auto-generado. Renombrala (ej. "Color", "Talle", "Material") antes de guardar.`,
        success: false,
      };
    }

    const variantes = variantesRaw.filter(
      (v) =>
        v.valores &&
        Object.entries(v.valores).some(([k, val]) => k.trim() && val?.trim()),
    );

    if (opciones.length === 0 || variantes.length === 0) {
      return {
        error:
          "Las variantes no tienen propiedades o valores válidos. Revisa la grilla antes de guardar.",
        success: false,
      };
    }

    // Mismo camino que editarProductoAction: normalizamos cada
    // (propiedad, valor) contra lo que ya existe en
    // atributos/atributo_valores antes de escribir el JSONB, para que un
    // producto nuevo no introduzca otra variante de casing de una
    // propiedad que ya existe (ej. "color" cuando ya existe "Color").
    const atributoCache = await construirCacheAtributos(supabase, opciones);

    const variantesToInsert = [];
    const stockLegacyToInsert = [];
    const relacionesPorIndice: {
      valoresOriginales: Record<string, string>;
    }[] = [];

    for (const v of variantes) {
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

      const vPrecio = v.precio ? Number.parseFloat(v.precio) : null;
      const vCosto = v.precio_costo ? Number.parseFloat(v.precio_costo) : null;
      const vStock = Number.parseInt(v.stock || "0");

      variantesToInsert.push({
        producto_id: nuevoProducto.id,
        nombre_display: nombreDisplay,
        atributos: valoresCanonicos,
        precio: vPrecio,
        costo: vCosto,
        stock: vStock,
        sku: v.sku || null,
      });

      stockLegacyToInsert.push({
        producto_id: nuevoProducto.id,
        variante: nombreDisplay,
        cantidad: vStock,
      });

      relacionesPorIndice.push({ valoresOriginales: v.valores });
    }

    const { data: variantesInsertadas, error: varInsertError } =
      await supabase
        .from("producto_variantes")
        .insert(variantesToInsert)
        .select("id");
    if (varInsertError) throw varInsertError;

    const { error: stockInsertError } = await supabase
      .from("productos_stock")
      .insert(stockLegacyToInsert);
    if (stockInsertError) throw stockInsertError;

    const varValores = (variantesInsertadas ?? []).flatMap((varData, idx) => {
      const { valoresOriginales } = relacionesPorIndice[idx];
      return Object.entries(valoresOriginales).flatMap(
        ([opNombre, opValor]) => {
          const entry = atributoCache[opNombre];
          const valorEntry = entry?.valores[opValor];
          if (!entry || !valorEntry) return [];
          return [
            {
              variante_id: varData.id,
              atributo_id: entry.atributoId,
              atributo_valor_id: valorEntry.valorId,
            },
          ];
        },
      );
    });

    if (varValores.length > 0) {
      const { error: varValoresError } = await supabase
        .from("producto_variante_valores")
        .insert(varValores);
      if (varValoresError) throw varValoresError;
    }
  } catch (error) {
    console.error("[CREATE PRODUCT ERROR]", error);

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
