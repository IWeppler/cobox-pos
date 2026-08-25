export type PerdonDeuda = {
  monto: number;
  motivo: string;
};

export type ResultadoValidacion =
  | { ok: true; monto: number; motivo: string; saldoFinal: number }
  | { ok: false; error: string };

/** Perdonar una deuda es una decisión, no un descuido: el motivo queda en el
 * historial y es lo único que dentro de seis meses explica por qué el número
 * bajó sin que entrara plata. */
const MOTIVO_MINIMO = 3;

/**
 * Valida un perdón de deuda contra el saldo real del cliente.
 *
 * Está separada de la action para poder probar las reglas sin base. Las tres
 * que importan:
 *
 * 1. NUNCA más que el saldo. Perdonar de más dejaría el saldo en negativo, o
 *    sea al comercio debiéndole plata a la clienta — un número que después
 *    nadie sabe cómo cobrar ni cómo devolver.
 * 2. NUNCA cero ni negativo. Un "perdón" de $0 solo ensucia el historial, y
 *    uno negativo sería una deuda nueva disfrazada.
 * 3. SIEMPRE con motivo. Es lo que separa un perdón de un error de tipeo.
 */
export function validarPerdonDeuda(
  entrada: PerdonDeuda,
  saldoActual: number,
): ResultadoValidacion {
  const monto = Number(entrada.monto);
  const motivo = (entrada.motivo || "").trim();

  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto a perdonar tiene que ser mayor a $0." };
  }
  if (saldoActual <= 0) {
    return { ok: false, error: "Este cliente no tiene deuda para perdonar." };
  }
  // Con centavos de por medio, exigir igualdad exacta al peso rechazaría un
  // "perdonar todo" legítimo. Medio peso de tolerancia alcanza.
  if (monto > saldoActual + 0.5) {
    return {
      ok: false,
      error: "No se puede perdonar más de lo que el cliente debe.",
    };
  }
  if (motivo.length < MOTIVO_MINIMO) {
    return {
      ok: false,
      error: "Escribí el motivo: queda en el historial del cliente.",
    };
  }

  return {
    ok: true,
    monto,
    motivo,
    saldoFinal: Math.max(0, saldoActual - monto),
  };
}
