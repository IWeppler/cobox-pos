import { SupabaseClient } from "@supabase/supabase-js";

export interface TurnoActivoResuelto {
  turnoId: string | null;
  modoCaja: string;
  requiereCajaAbierta: boolean;
}

/** Las dos columnas de `configuracion_pos` que esta función necesita. */
export interface ConfigTurno {
  modo_caja?: string | null;
  requiere_caja_abierta?: boolean | null;
}

/**
 * `configPrecargada` existe para quien YA trajo esa fila en el mismo request.
 *
 * El caso es `create-sale`: leía `configuracion_pos` acá y otra vez más abajo
 * para el resto de sus columnas. Es la misma fila, y en el camino de la venta
 * un round-trip de más se paga en cada ticket. Los demás llamadores no pasan
 * nada y siguen funcionando igual.
 */
export async function resolverTurnoActivo(
  supabase: SupabaseClient,
  userId: string,
  configPrecargada?: ConfigTurno | null,
): Promise<TurnoActivoResuelto> {
  const config =
    configPrecargada ??
    (
      await supabase
        .from("configuracion_pos")
        .select("modo_caja, requiere_caja_abierta")
        .single()
    ).data;

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
