"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";

/**
 * Los ids marcados a mano como cuenta de prueba.
 *
 * El corte de acceso vive en la RLS de `usuarios_prueba` (solo super admin):
 * para cualquier otro esto devuelve un set vacío, que degrada a "no hay
 * marcas" en vez de romper.
 */
export async function getUsuariosPruebaAction(): Promise<Set<string>> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("usuarios_prueba")
    .select("usuario_id");

  if (error) {
    console.error("[USUARIOS PRUEBA]", error);
    return new Set();
  }

  return new Set((data ?? []).map((f) => f.usuario_id as string));
}

/**
 * Marca o desmarca una cuenta como prueba propia.
 *
 * Con `.select()` y chequeo de filas: un INSERT o un DELETE filtrado por RLS
 * vuelve con 0 filas y sin error, así que sin esto el botón diría "listo"
 * sobre algo que no pasó. Es el mismo error que costó 35 fotos el 5/9/2026.
 *
 * No borra al usuario ni lo esconde: solo lo saca del denominador del embudo.
 */
export async function marcarUsuarioPruebaAction(
  usuarioId: string,
  esPrueba: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión vencida." };

  if (esPrueba) {
    const { data, error } = await supabase
      .from("usuarios_prueba")
      .upsert(
        { usuario_id: usuarioId, marcado_por: user.id },
        { onConflict: "usuario_id" },
      )
      .select("usuario_id");

    if (error) {
      console.error("[USUARIOS PRUEBA] marcar", error);
      return { ok: false, error: "No se pudo marcar." };
    }
    if (!data || data.length === 0) {
      return { ok: false, error: "No tenés permiso para marcar cuentas." };
    }
  } else {
    const { data, error } = await supabase
      .from("usuarios_prueba")
      .delete()
      .eq("usuario_id", usuarioId)
      .select("usuario_id");

    if (error) {
      console.error("[USUARIOS PRUEBA] desmarcar", error);
      return { ok: false, error: "No se pudo desmarcar." };
    }
    if (!data || data.length === 0) {
      return { ok: false, error: "No tenés permiso para desmarcar cuentas." };
    }
  }

  revalidatePath("/admincomerz");
  return { ok: true };
}
