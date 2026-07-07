import { SupabaseClient } from "@supabase/supabase-js";

export interface TurnoActivoResuelto {
  turnoId: string | null;
  modoCaja: string;
  requiereCajaAbierta: boolean;
}

export async function resolverTurnoActivo(
  supabase: SupabaseClient,
  userId: string,
): Promise<TurnoActivoResuelto> {
  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("modo_caja, requiere_caja_abierta")
    .single();

  const modoCaja = config?.modo_caja || "UNICA";
  const requiereCajaAbierta = config?.requiere_caja_abierta ?? true;

  let query = supabase.from("turnos_caja").select("id").eq("estado", "ABIERTO");

  if (modoCaja === "UNICA") {
    query = query.eq("modo", "UNICA");
  } else if (modoCaja === "POR_USUARIO") {
    query = query.eq("modo", "POR_USUARIO").eq("usuario_id", userId);
  }

  const { data: turno } = await query.maybeSingle();

  return { turnoId: turno?.id ?? null, modoCaja, requiereCajaAbierta };
}
