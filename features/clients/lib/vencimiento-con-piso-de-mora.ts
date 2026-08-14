/**
 * Resuelve el vencimiento de la deuda cuando conviven dos orígenes que quieren
 * fijarlo: el recálculo desde los movimientos manuales y la última mora
 * cobrada.
 *
 * Gana el MÁS TARDÍO, y no es arbitrario. Cuando se cobra una mora, el recargo
 * se materializa como DEBITO y entra al capital, y por eso el vencimiento se
 * corre a "hoy + plazo": es lo que evita el interés sobre interés. Si después
 * alguien edita o anula un ajuste manual viejo, el recálculo desde cero
 * propondría la fecha del movimiento más antiguo — dejando al cliente vencido
 * otra vez sobre un saldo que YA tiene la mora adentro, o sea cobrándole
 * recargo sobre el recargo.
 *
 * Las fechas van en "YYYY-MM-DD", que ordena bien como string (mismo criterio
 * que el resto de la feature con la columna `date`).
 */
export function resolverVencimientoConPisoDeMora(
  /** Lo que propone el recálculo desde movimientos manuales. Null si no quedó
   * ninguno vigente. */
  candidato: string | null,
  /** Vencimiento fijado por la última mora cobrada. Null si nunca se cobró. */
  pisoPorMora: string | null,
): string | null {
  if (!pisoPorMora) return candidato;
  if (!candidato) return pisoPorMora;
  return candidato > pisoPorMora ? candidato : pisoPorMora;
}
