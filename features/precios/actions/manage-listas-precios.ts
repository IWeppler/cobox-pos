"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { TIPOS_REGLA_LISTA } from "@/entities/precios/types";

/**
 * Alta, edición y baja de listas de precios.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRES COSAS QUE ESTE ARCHIVO HACE A PROPÓSITO
 *
 * 1. VUELVE A PREGUNTAR `is_admin()`. La RLS de `listas_precios` ya exige
 *    ADMIN para escribir, y el panel esconde la sección: ninguna de las dos
 *    cosas es control de acceso. Un server action es un endpoint, y esta
 *    comprobación es la que convierte un 0-filas mudo en un error entendible.
 *
 * 2. TODO UPDATE Y DELETE LLEVA `.select("id")` Y CUENTA FILAS. Un UPDATE
 *    filtrado por RLS es un ÉXITO SILENCIOSO: PostgREST devuelve 0 filas y
 *    `error: null`. Sin el select, un ENCARGADO vería "Lista actualizada" y no
 *    se habría guardado nada. Es exactamente lo que costó 35 fotos el 5/9/2026.
 *
 * 3. VALIDA EL VALOR ACÁ ADEMÁS DEL CHECK. La base rechaza un porcentaje de
 *    −100 o un markup de 0, pero como violación de constraint: un error de
 *    Postgres en la cara de la dueña no le dice qué corregir.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface Resultado {
  error: string | null;
  success: boolean;
}

const ok: Resultado = { error: null, success: true };
const falla = (error: string): Resultado => ({ error, success: false });

/** El campo que el formulario manda, ya normalizado y validado. */
interface CamposLista {
  nombre: string;
  tipo_regla: string;
  valor: number;
  admite_promociones: boolean;
}

function leerCampos(formData: FormData): CamposLista | string {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipoRegla = String(formData.get("tipo_regla") ?? "");
  const valor = Number(formData.get("valor"));
  const admiteRaw = formData.get("admite_promociones");

  if (!nombre) return "Poné un nombre para la lista.";
  if (nombre.length > 60) return "El nombre es demasiado largo.";

  if (!(TIPOS_REGLA_LISTA as readonly string[]).includes(tipoRegla)) {
    return "Elegí cómo se calcula el precio de la lista.";
  }
  if (!Number.isFinite(valor)) return "El valor de la regla tiene que ser un número.";

  // Espejo de `listas_precios_valor_coherente`, con las palabras del negocio.
  if (tipoRegla === "PORCENTAJE" && valor <= -100) {
    return "Un descuento del 100% dejaría el producto en $0. Usá un valor menor.";
  }
  if (tipoRegla === "MARKUP" && valor <= 0) {
    return "El multiplicador sobre el costo tiene que ser mayor a 0.";
  }

  return {
    nombre,
    tipo_regla: tipoRegla,
    valor,
    // El switch solo viaja cuando está prendido, así que ausente = false, que
    // es el default de la base. Ver el comentario de la columna: acumular una
    // promo sobre un precio de lista sin haberlo decidido se come el margen.
    admite_promociones: admiteRaw === "true" || admiteRaw === "on",
  };
}

async function clienteAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "No autorizado." };

  const { data: esAdmin } = await supabase.rpc("is_admin");
  if (!esAdmin) {
    return {
      supabase: null,
      error: "Solo un administrador puede configurar las listas de precios.",
    };
  }

  return { supabase, error: null };
}

/** 23505: ya hay una lista con ese nombre en este comercio (índice único). */
const esNombreRepetido = (codigo?: string) => codigo === "23505";

export async function crearListaPrecioAction(
  _prevState: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const campos = leerCampos(formData);
  if (typeof campos === "string") return falla(campos);

  const { supabase, error: errorAcceso } = await clienteAdmin();
  if (!supabase) return falla(errorAcceso!);

  // `negocio_id` no se manda: lo pone el DEFAULT
  // `security.current_negocio_id()`, que valida contra `usuarios_negocios`.
  const { error } = await supabase.from("listas_precios").insert({
    ...campos,
    activa: true,
  });

  if (error) {
    if (esNombreRepetido(error.code)) {
      return falla("Ya tenés una lista con ese nombre.");
    }
    console.error("[LISTAS PRECIOS] Error creando:", error);
    return falla("No se pudo crear la lista.");
  }

  revalidatePath("/configuracion");
  return ok;
}

export async function editarListaPrecioAction(
  _prevState: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const id = String(formData.get("id") ?? "");
  if (!id) return falla("Falta la lista a editar.");

  const campos = leerCampos(formData);
  if (typeof campos === "string") return falla(campos);

  const { supabase, error: errorAcceso } = await clienteAdmin();
  if (!supabase) return falla(errorAcceso!);

  const { data, error } = await supabase
    .from("listas_precios")
    .update(campos)
    .eq("id", id)
    // Sin esto no se distingue "guardado" de "la RLS lo filtró". Ver el
    // comentario de arriba.
    .select("id");

  if (error) {
    if (esNombreRepetido(error.code)) {
      return falla("Ya tenés una lista con ese nombre.");
    }
    console.error("[LISTAS PRECIOS] Error editando:", error);
    return falla("No se pudo guardar la lista.");
  }
  if (!data || data.length === 0) {
    return falla("No se guardó: esa lista no existe o no la podés editar.");
  }

  revalidatePath("/configuracion");
  return ok;
}

/**
 * Prender y apagar una lista.
 *
 * APAGAR NO ES BORRAR, y es la acción que hay que preferir: una lista inactiva
 * deja de aplicarse —`precioDeLista` la corta con motivo `LISTA_INACTIVA`— pero
 * conserva los precios fijos cargados y a qué clientes estaba asignada. Borrar
 * pierde las dos cosas.
 */
export async function toggleListaPrecioAction(
  id: string,
  activaAhora: boolean,
): Promise<Resultado> {
  const { supabase, error: errorAcceso } = await clienteAdmin();
  if (!supabase) return falla(errorAcceso!);

  const { data, error } = await supabase
    .from("listas_precios")
    .update({ activa: !activaAhora })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[LISTAS PRECIOS] Error cambiando estado:", error);
    return falla("No se pudo cambiar el estado de la lista.");
  }
  if (!data || data.length === 0) {
    return falla("No se guardó: esa lista no existe o no la podés editar.");
  }

  revalidatePath("/configuracion");
  return ok;
}

/**
 * Borrar una lista.
 *
 * Se lleva por delante sus precios fijos (`on delete cascade`) y deja en NULL
 * la lista sugerida de los clientes que la tenían (`on delete set null`).
 *
 * Lo que NO toca es el historial: `ventas.lista_precio_id` no tiene FK y el
 * nombre está congelado en `ventas.lista_precio_nombre`, así que un ticket
 * vendido con esta lista sigue diciendo con cuál se cobró. Ninguna venta
 * cambia de total: el precio cobrado vive en `ventas_items`.
 */
export async function eliminarListaPrecioAction(
  id: string,
): Promise<Resultado> {
  const { supabase, error: errorAcceso } = await clienteAdmin();
  if (!supabase) return falla(errorAcceso!);

  const { data, error } = await supabase
    .from("listas_precios")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[LISTAS PRECIOS] Error eliminando:", error);
    return falla("No se pudo eliminar la lista.");
  }
  if (!data || data.length === 0) {
    return falla("No se eliminó: esa lista no existe o no la podés borrar.");
  }

  revalidatePath("/configuracion");
  return ok;
}
