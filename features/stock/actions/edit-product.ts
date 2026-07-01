"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { slugify } from "@/shared/utils/slugify";

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
  const updateData: any = {
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
    console.error("Error BD:", errorProducto);
    return {
      error: "Hubo un error al actualizar el producto base.",
      success: false,
    };
  }

  // 3. Procesar Variantes Editadas
  // Estrategia: Borramos todo lo viejo de PV y PVV y reinsertamos lo que mande el form.
  // Nota: En un sistema gigante esto podría romper históricos si se borran IDs.
  // Para el MVP y simplificar, asumimos que el usuario edita la grilla final.

  if (!tieneVariantes) {
    // Borramos todas las variantes dinámicas que tuviera antes
    await supabase.from("producto_variantes").delete().eq("producto_id", id);

    // Insertamos/Upsertamos variante Unica
    await supabase.from("producto_variantes").insert({
      producto_id: id,
      nombre_display: "Único",
      stock: stockBase,
    });

    // Legacy support
    await supabase.from("productos_stock").delete().eq("producto_id", id);
    await supabase
      .from("productos_stock")
      .insert({ producto_id: id, variante: "Único", cantidad: stockBase });
  } else {
    // Es producto con opciones dinámicas
    const opcionesStr = formData.get("opciones") as string;
    const variantesStr = formData.get("variantes") as string;

    if (opcionesStr && variantesStr) {
      const opciones = JSON.parse(opcionesStr) as {
        nombre: string;
        valores: string[];
      }[];
      const variantes = JSON.parse(variantesStr) as any[];

      const attrMap: Record<string, string> = {};
      const valMap: Record<string, Record<string, string>> = {};

      // A. Crear o reciclar Opciones
      for (const op of opciones) {
        const slugAttr = slugify(op.nombre);
        let { data: attr } = await supabase
          .from("atributos")
          .select("id")
          .eq("slug", slugAttr)
          .single();
        if (!attr) {
          const { data: newAttr } = await supabase
            .from("atributos")
            .insert({
              nombre: op.nombre,
              slug: slugAttr,
              tipo: "TEXT",
              activo: true,
            })
            .select("id")
            .single();
          attr = newAttr;
        }
        if (attr) {
          attrMap[op.nombre] = attr.id;
          valMap[op.nombre] = {};
          for (const v of op.valores) {
            const slugVal = slugify(v);
            let { data: valData } = await supabase
              .from("atributo_valores")
              .select("id")
              .eq("atributo_id", attr.id)
              .eq("slug", slugVal)
              .single();
            if (!valData) {
              const { data: newVal } = await supabase
                .from("atributo_valores")
                .insert({
                  atributo_id: attr.id,
                  valor: v,
                  slug: slugVal,
                  activo: true,
                })
                .select("id")
                .single();
              valData = newVal;
            }
            if (valData) valMap[op.nombre][v] = valData.id;
          }
        }
      }

      // Borramos variantes viejas para refrescar la grilla limpia
      await supabase.from("producto_variantes").delete().eq("producto_id", id);
      await supabase.from("productos_stock").delete().eq("producto_id", id); // legacy

      // B. Guardar las Variantes nuevas
      for (const v of variantes) {
        const nombreDisplay = opciones
          .map((op) => v.valores[op.nombre])
          .filter(Boolean)
          .join(" / ");

        const vPrecio = v.precio ? Number.parseFloat(v.precio) : null;
        const vCosto = v.precio_costo
          ? Number.parseFloat(v.precio_costo)
          : null;
        const vStock = Number.parseInt(v.stock || "0");

        const { data: varData } = await supabase
          .from("producto_variantes")
          .insert({
            producto_id: id,
            nombre_display: nombreDisplay,
            atributos: v.valores,
            precio: vPrecio,
            costo: vCosto,
            stock: vStock,
            sku: v.sku || null,
          })
          .select("id")
          .single();

        if (varData) {
          const varValores = [];
          for (const [opNombre, opValor] of Object.entries(v.valores)) {
            const aId = attrMap[opNombre];
            const avId = valMap[opNombre]?.[opValor as string];
            if (aId && avId) {
              varValores.push({
                variante_id: varData.id,
                atributo_id: aId,
                atributo_valor_id: avId,
              });
            }
          }
          if (varValores.length > 0)
            await supabase.from("producto_variante_valores").insert(varValores);
        }

        // Legacy support
        await supabase
          .from("productos_stock")
          .insert({
            producto_id: id,
            variante: nombreDisplay,
            cantidad: vStock,
          });
      }
    }
  }

  revalidatePath("/stock");
  revalidatePath("/store");

  return { error: null, success: true };
}
