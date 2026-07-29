import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de SOLO LECTURA al proyecto del Catálogo Maestro, que es un
 * proyecto Supabase distinto al del comercio.
 *
 * Va sin prefijo NEXT_PUBLIC_ a propósito: aunque la clave es publishable y
 * el maestro solo expone SELECT por RLS, no hay ninguna razón para embeberla
 * en el bundle del navegador. Las consultas salen desde server actions.
 *
 * Sin sesión ni cookies: contra el maestro siempre somos `anon`. El comercio
 * NO puede escribir ahí — la escritura crowdsourced va por la Edge Function
 * de T7 con service_role.
 */
const maestroUrl = process.env.CATALOGO_MAESTRO_SUPABASE_URL;
const maestroKey = process.env.CATALOGO_MAESTRO_SUPABASE_PUBLISHABLE_KEY;

export const catalogoMaestroConfigurado = Boolean(maestroUrl && maestroKey);

/**
 * Devuelve null si el comercio no tiene el maestro configurado. Quien llama
 * DEBE tratar ese null como "no hay match" y seguir con el alta manual: un
 * comercio de indumentaria no tiene por qué tener estas env vars, y el
 * maestro caído nunca puede bloquear una carga de stock.
 */
export function createCatalogoMaestroClient() {
  if (!maestroUrl || !maestroKey) return null;

  return createSupabaseClient(maestroUrl, maestroKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
