"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import type { FilaEmbudoAlta } from "@/features/admin/lib/embudo-alta";

/**
 * Los hechos crudos del embudo de alta, por usuario.
 *
 * La RPC devuelve fechas y booleanos, NO métricas: qué cuenta como pérdida, a
 * quién se excluye y cuál es el peor escalón se decide en `embudo-alta.ts`,
 * que tiene tests. Mismo criterio que `funnel-comerz.ts`.
 *
 * El corte de acceso vive en la BASE (`where security.is_super_admin()` adentro
 * de la función, que es SECURITY DEFINER porque lee `auth.users`). Acá no se
 * repite: si esto llegara a correr para alguien que no es super admin, la RPC
 * devuelve cero filas en vez de datos. Ver 20260909120000.
 */
export async function getEmbudoAltaAction(): Promise<FilaEmbudoAlta[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("embudo_de_alta");

  if (error) {
    console.error("[EMBUDO ALTA]", error);
    return [];
  }

  return (data ?? []).map(
    (f: Record<string, unknown>): FilaEmbudoAlta => ({
      id: f.id as string,
      email: (f.email as string) ?? "",
      registrado: f.registrado as string,
      confirmado: (f.confirmado as string | null) ?? null,
      ultimaSesion: (f.ultima_sesion as string | null) ?? null,
      negocioCreado: (f.negocio_creado as string | null) ?? null,
      miembroDeAlgunNegocio: Boolean(f.miembro_de_algun_negocio),
      invitacionPendiente: Boolean(f.invitacion_pendiente),
      esSuperAdmin: Boolean(f.es_super_admin),
    }),
  );
}
