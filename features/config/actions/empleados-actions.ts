"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { EmpleadosActionState } from "@/entities/roles/types";

// ============================================================
// 1. CAMBIAR EL ROL DE UN EMPLEADO
// ============================================================
export async function actualizarRolEmpleadoAction(
  perfilId: string,
  nuevoRolId: string,
): Promise<EmpleadosActionState> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: esAdmin } = await supabase.rpc("is_admin");
  if (!esAdmin) {
    return { error: "No tenés permisos para gestionar empleados.", success: false };
  }

  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id, nombre");
  if (rolesError || !roles) {
    return { error: "No se pudo cargar el catálogo de roles.", success: false };
  }

  const rolAdmin = roles.find((r) => r.nombre === "ADMIN");
  const nuevoRol = roles.find((r) => r.id === nuevoRolId);
  if (!rolAdmin || !nuevoRol) {
    return { error: "Rol inválido.", success: false };
  }

  const { data: perfilActual, error: perfilError } = await supabase
    .from("perfiles")
    .select("rol_id")
    .eq("id", perfilId)
    .single();
  if (perfilError || !perfilActual) {
    return { error: "No se encontró el empleado a modificar.", success: false };
  }

  // Guardia "último admin": si este perfil es ADMIN hoy y el nuevo rol
  // no lo es, hay que confirmar que quede al menos otro ADMIN activo.
  // Chequeo server-side autoritativo — el disabled del selector en el
  // cliente es solo UX, no seguridad.
  if (perfilActual.rol_id === rolAdmin.id && nuevoRolId !== rolAdmin.id) {
    const { count: cantidadAdmins } = await supabase
      .from("perfiles")
      .select("id", { count: "exact", head: true })
      .eq("rol_id", rolAdmin.id);

    if ((cantidadAdmins ?? 0) <= 1) {
      return {
        error:
          "No podés quitarle el rol ADMIN al único administrador que queda. Asigná otro ADMIN primero.",
        success: false,
      };
    }
  }

  // Puente temporal: mientras el resto de la app (middleware, sidebar,
  // gates de página) siga leyendo perfiles.rol en vez de tiene_permiso(),
  // un ENCARGADO se comporta como VENDEDOR en toda navegación/UI
  // existente — sus permisos reales (ventas.anular, caja.cerrar_ajena,
  // etc.) solo tienen efecto en las policies RLS ya cableadas, no en la
  // UI, hasta que se complete el cableado módulo por módulo. Sacar este
  // mapeo cuando eso pase.
  const rolTextoLegacy = nuevoRol.nombre === "ADMIN" ? "ADMIN" : "VENDEDOR";

  const { error: updateError } = await supabase
    .from("perfiles")
    .update({ rol_id: nuevoRolId, rol: rolTextoLegacy })
    .eq("id", perfilId);

  if (updateError) {
    console.error("[ACTUALIZAR ROL EMPLEADO ERROR]", updateError);
    return { error: "Ocurrió un error al actualizar el rol.", success: false };
  }

  revalidatePath("/configuracion");
  return { error: null, success: true };
}

// ============================================================
// 2. TILDAR/DESTILDAR UN PERMISO PARA UN ROL
// ============================================================
export async function actualizarRolPermisoAction(
  rolId: string,
  permisoId: string,
  otorgado: boolean,
): Promise<EmpleadosActionState> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: esAdmin } = await supabase.rpc("is_admin");
  if (!esAdmin) {
    return { error: "No tenés permisos para gestionar permisos.", success: false };
  }

  const { data: rol, error: rolError } = await supabase
    .from("roles")
    .select("nombre")
    .eq("id", rolId)
    .single();
  if (rolError || !rol) {
    return { error: "Rol inválido.", success: false };
  }

  // ADMIN tiene acceso total vía is_admin() sin importar esta tabla —
  // no se edita desde acá, ni aunque alguien fuerce el request.
  if (rol.nombre === "ADMIN") {
    return {
      error: "El rol ADMIN no se edita: siempre tiene acceso total.",
      success: false,
    };
  }

  if (otorgado) {
    const { error } = await supabase
      .from("rol_permisos")
      .insert({ rol_id: rolId, permiso_id: permisoId });
    if (error && error.code !== "23505") {
      console.error("[ACTUALIZAR ROL PERMISO ERROR]", error);
      return { error: "Ocurrió un error al otorgar el permiso.", success: false };
    }
  } else {
    const { error } = await supabase
      .from("rol_permisos")
      .delete()
      .eq("rol_id", rolId)
      .eq("permiso_id", permisoId);
    if (error) {
      console.error("[ACTUALIZAR ROL PERMISO ERROR]", error);
      return { error: "Ocurrió un error al quitar el permiso.", success: false };
    }
  }

  revalidatePath("/configuracion");
  return { error: null, success: true };
}
