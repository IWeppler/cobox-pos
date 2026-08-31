export type EstadoAcceso =
  "SIN_CONFIRMAR" | "NO_ENTRO" | "SOLO_EL_LINK" | "ENTRO";

export interface DatosAcceso {
  emailConfirmadoEn: string | null;
  ultimoIngreso: string | null;
  ultimaActividad: string | null;
}

/**
 * Cuánto puede pasar entre confirmar el mail y la última señal de vida para
 * que siga siendo "abrió el link y se fue".
 *
 * El link de confirmación de Supabase ABRE sesión, así que confirmar y entrar
 * son el mismo evento en los datos. Lo único que los separa es que después
 * haya pasado ALGO más. Diez minutos es holgado a propósito: alguien que mira
 * dos pantallas y cierra no completó nada, y contarlo como "entró" es lo que
 * hace que el panel diga que están todos adentro.
 */
const MINUTOS_DEL_LINK = 10;

/**
 * En qué punto quedó el acceso del dueño de un comercio nuevo.
 *
 * La pregunta que contesta es "¿pudo entrar después de confirmar el mail?", y
 * no se puede responder con un booleano: los cuatro estados existen porque los
 * tres primeros piden acciones distintas (reenviar la confirmación, mandarle el
 * link de nuevo, escribirle a ver qué pasó) y el cuarto no pide nada.
 *
 * `ultimaActividad` es el mayor entre el último login y el último refresh de
 * token (ver `comercios_con_uso`): una sesión abierta hace tres días que sigue
 * renovando es actividad de hoy.
 */
export function estadoAcceso({
  emailConfirmadoEn,
  ultimoIngreso,
  ultimaActividad,
}: DatosAcceso): EstadoAcceso {
  if (!emailConfirmadoEn) return "SIN_CONFIRMAR";
  if (!ultimoIngreso) return "NO_ENTRO";

  const confirmado = new Date(emailConfirmadoEn).getTime();
  const ingreso = new Date(ultimoIngreso).getTime();

  // Un ingreso ANTERIOR a la confirmación es de otra vida del usuario (se
  // registró, no confirmó, volvieron a mandarle el mail). Para esta pregunta
  // no cuenta.
  if (ingreso < confirmado) return "NO_ENTRO";

  const ultima = ultimaActividad
    ? new Date(ultimaActividad).getTime()
    : ingreso;

  const minutosDeUso = (ultima - confirmado) / 60_000;

  return minutosDeUso <= MINUTOS_DEL_LINK ? "SOLO_EL_LINK" : "ENTRO";
}

export const ETIQUETA_ACCESO: Record<EstadoAcceso, string> = {
  SIN_CONFIRMAR: "Sin confirmar",
  NO_ENTRO: "Confirmó, no entró",
  SOLO_EL_LINK: "Solo abrió el link",
  ENTRO: "Entró",
};
