"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ConfiguracionPOS } from "@/entities/config/types";

export async function getConfiguracionAction(): Promise<{
  data: ConfiguracionPOS | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
      .from("configuracion_pos")
      .select("*")
      .single();

    if (error) {
      console.error("Error al obtener configuración:", error);
      return { data: null, error: "No se pudo cargar la configuración." };
    }

    return { data: data as ConfiguracionPOS, error: null };
  } catch (err) {
    console.error("Error inesperado:", err);
    return { data: null, error: "Ocurrió un error en el servidor." };
  }
}

export async function updateConfiguracionAction(
  prevState: { error: string | null; success: boolean },
  formData: FormData,
) {
  const id = formData.get("id") as string;
  const posName = ((formData.get("posName") as string) ?? "").trim();
  const razon_social = formData.get("razon_social") as string;
  const cuit = formData.get("cuit") as string;
  const condicion_iva = formData.get("condicion_iva") as string;
  const inicio_actividades = formData.get("inicio_actividades") as string;
  const provincia = formData.get("provincia") as string;
  const localidad = formData.get("localidad") as string;
  const whatsapp = ((formData.get("whatsapp") as string) ?? "").trim();
  const direccion = formData.get("direccion") as string;
  const mensaje_ticket = formData.get("mensaje_ticket") as string;
  const logoFile = formData.get("logo") as File | null;

  // El id sale de un input hidden: si falta no es que el usuario olvidó algo,
  // es que el formulario se cargó mal. Merece su propio mensaje, en vez de
  // mandarlo a revisar campos que ya completó.
  if (!id) {
    return {
      error: "No se pudo identificar la configuración. Recargá la página.",
      success: false,
    };
  }

  // Los mensajes nombran el campo tal cual figura en pantalla: "el nombre" a
  // secas mandaba a buscar entre Nombre Comercial y Razón Social.
  if (!posName || !whatsapp) {
    const faltantes = [
      !posName ? "Nombre Comercial" : null,
      !whatsapp ? "Teléfono / WhatsApp" : null,
    ].filter(Boolean);

    return {
      error: `Falta completar: ${faltantes.join(" y ")}.`,
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let posLogoUrl: string | undefined = undefined;

  // 1. Si el usuario subió un nuevo logo, lo subimos al bucket "logos"
  if (logoFile && logoFile.size > 0) {
    // Bajo la carpeta del negocio: la policy de storage no deja escribir
    // fuera de ella, y así el logo de un comercio no pisa el de otro.
    const { data: negocioId } = await supabase.rpc("negocio_actual");
    if (!negocioId) {
      return { error: "No hay un negocio activo en esta sesión.", success: false };
    }

    const fileExt = logoFile.name.split(".").pop();
    const fileName = `${negocioId}/logo-${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(fileName, logoFile, { cacheControl: "31536000" });

    if (!uploadError) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("logos").getPublicUrl(fileName);
      posLogoUrl = publicUrl;
    } else {
      console.error("Error subiendo logo:", uploadError);
      return { error: "No se pudo subir la imagen del logo.", success: false };
    }
  }

  // 2. Preparamos la data a actualizar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    posName,
    whatsapp,
    direccion,
    razon_social,
    cuit,
    condicion_iva,
    inicio_actividades,
    provincia,
    localidad,
    mensaje_ticket,
    updated_at: new Date().toISOString(),
  };

  // Solo actualizamos el logo si se subió uno nuevo
  if (posLogoUrl) {
    updateData.posLogo = posLogoUrl;
  }

  // 3. Impactamos en la BD
  const { error } = await supabase
    .from("configuracion_pos")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("Error al actualizar configuración:", error);
    return { error: "No se pudo guardar la configuración.", success: false };
  }

  revalidatePath("/", "layout");

  return { error: null, success: true };
}
