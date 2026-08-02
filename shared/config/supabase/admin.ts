import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role. SALTEA RLS: usar solo para lo que la API de Auth
 * no deja hacer de otra forma — hoy, invitar usuarios por email.
 *
 * Nunca lleva prefijo NEXT_PUBLIC_ y solo se importa desde server actions.
 * Cualquier lectura o escritura de datos del negocio va por el cliente normal,
 * que sí pasa por las policies.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const adminConfigurado = Boolean(supabaseUrl && serviceRoleKey);

export const createAdminClient = () => {
  if (!adminConfigurado) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY: no se pueden enviar invitaciones.",
    );
  }

  return createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};
