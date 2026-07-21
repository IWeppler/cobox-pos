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
  const posName = formData.get("posName") as string;
  const whatsapp = formData.get("whatsapp") as string;
  const direccion = formData.get("direccion") as string;
  const mensaje_ticket = formData.get("mensaje_ticket") as string;
  const logoFile = formData.get("logo") as File | null;

  if (!id || !posName || !whatsapp) {
    return {
      error: "El nombre y el WhatsApp son obligatorios.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let posLogoUrl: string | undefined = undefined;

  // 1. Si el usuario subió un nuevo logo, lo subimos al bucket "logos"
  if (logoFile && logoFile.size > 0) {
    const fileExt = logoFile.name.split(".").pop();
    const fileName = `logo-${crypto.randomUUID()}.${fileExt}`;

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
