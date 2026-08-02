"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  COOKIE_NEGOCIO_ACTIVO,
  COOKIE_NEGOCIO_MAX_AGE,
} from "@/shared/lib/negocio-activo";

export interface MembresiaNegocio {
  negocio_id: string;
  rol: string;
  es_owner: boolean;
  nombre: string;
  slug: string;
  estado: string;
}

/**
 * Negocios a los que pertenece el usuario logueado. Se usa para decidir si
 * hay que mostrar el selector: con uno solo se entra derecho.
 */
export async function listarMisNegociosAction(): Promise<MembresiaNegocio[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("usuarios_negocios")
    .select("negocio_id, rol, es_owner, negocios(nombre, slug, estado)")
    .eq("usuario_id", user.id);

  if (error) {
    console.error("[LISTAR MIS NEGOCIOS ERROR]", error);
    return [];
  }

  return (data ?? [])
    .map((fila) => {
      // El embed de Supabase puede venir como objeto o como array de uno.
      const negocio = Array.isArray(fila.negocios)
        ? fila.negocios[0]
        : fila.negocios;
      return {
        negocio_id: fila.negocio_id as string,
        rol: fila.rol as string,
        es_owner: fila.es_owner as boolean,
        nombre: negocio?.nombre ?? "Negocio",
        slug: negocio?.slug ?? "",
        estado: negocio?.estado ?? "activo",
      };
    })
    .filter((m) => m.estado === "activo");
}

/**
 * Deja elegido el negocio en la cookie. Verifica la membresía acá igual que
 * la base: así el error se ve como mensaje y no como una pantalla vacía.
 */
export async function seleccionarNegocioAction(negocioId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión vencida. Volvé a entrar.", success: false };

  const { data: membresia } = await supabase
    .from("usuarios_negocios")
    .select("negocio_id")
    .eq("usuario_id", user.id)
    .eq("negocio_id", negocioId)
    .maybeSingle();

  if (!membresia) {
    return { error: "No pertenecés a ese negocio.", success: false };
  }

  cookieStore.set(COOKIE_NEGOCIO_ACTIVO, negocioId, {
    path: "/",
    maxAge: COOKIE_NEGOCIO_MAX_AGE,
    sameSite: "lax",
    // No es httpOnly a propósito: el cliente de browser la lee para mandar
    // el header. No es una credencial, la membresía se valida en la base.
    httpOnly: false,
  });

  revalidatePath("/", "layout");
  return { error: null, success: true };
}

export async function salirDeNegocioAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);
  revalidatePath("/", "layout");
  return { error: null, success: true };
}

/**
 * Alta de negocio: el que lo crea queda como owner con rol ADMIN. Todo el
 * armado (roles, permisos del admin, configuración y método de pago inicial)
 * corre dentro de la RPC, en una transacción.
 */
export async function crearNegocioAction(
  prevState: { error: string | null; success: boolean },
  formData: FormData,
) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();

  if (!nombre) {
    return { error: "El nombre del negocio es obligatorio.", success: false };
  }

  const slug = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return {
      error: "El nombre tiene que tener al menos una letra o número.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: negocioId, error } = await supabase.rpc(
    "crear_negocio_con_owner",
    { p_nombre: nombre, p_slug: slug, p_whatsapp: whatsapp },
  );

  if (error) {
    console.error("[CREAR NEGOCIO ERROR]", error);
    // 23505 = slug o nombre ya tomado por otro negocio.
    if (error.code === "23505") {
      return {
        error: "Ya hay un negocio con ese nombre. Probá con otro.",
        success: false,
      };
    }
    return { error: "No se pudo crear el negocio.", success: false };
  }

  cookieStore.set(COOKIE_NEGOCIO_ACTIVO, negocioId as string, {
    path: "/",
    maxAge: COOKIE_NEGOCIO_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });

  revalidatePath("/", "layout");
  return { error: null, success: true };
}

/** Invita a alguien al negocio activo. Solo ADMIN (lo exige la RLS). */
export async function invitarAlNegocioAction(email: string, rolId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión vencida.", success: false, token: null };

  const negocioActivo = cookieStore.get(COOKIE_NEGOCIO_ACTIVO)?.value;

  const { data, error } = await supabase
    .from("invitaciones")
    .insert({
      email: email.trim().toLowerCase(),
      rol_id: rolId,
      invitado_por: user.id,
      ...(negocioActivo ? { negocio_id: negocioActivo } : {}),
    })
    .select("token")
    .single();

  if (error) {
    console.error("[INVITAR AL NEGOCIO ERROR]", error);
    if (error.code === "23505") {
      return {
        error: "Ya hay una invitación pendiente para ese email.",
        success: false,
        token: null,
      };
    }
    return { error: "No se pudo crear la invitación.", success: false, token: null };
  }

  revalidatePath("/configuracion");
  return { error: null, success: true, token: data.token as string };
}

/** El invitado acepta con el token que le llegó. */
export async function aceptarInvitacionAction(token: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: negocioId, error } = await supabase.rpc("aceptar_invitacion", {
    p_token: token,
  });

  if (error) {
    console.error("[ACEPTAR INVITACION ERROR]", error);
    return { error: error.message, success: false };
  }

  cookieStore.set(COOKIE_NEGOCIO_ACTIVO, negocioId as string, {
    path: "/",
    maxAge: COOKIE_NEGOCIO_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });

  revalidatePath("/", "layout");
  return { error: null, success: true };
}
