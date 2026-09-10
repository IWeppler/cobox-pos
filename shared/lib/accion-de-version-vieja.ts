/**
 * La pestaña quedó vieja después de un deploy.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PASA
 *
 * Cada Server Action tiene un ID que se genera en el build. Cuando entra un
 * deploy nuevo, los IDs cambian — pero la pestaña que ya estaba abierta sigue
 * teniendo los viejos en su JavaScript. El primer click que llama a una action
 * manda un ID que el servidor nuevo no conoce y Next tira "Failed to find
 * Server Action", que NO es una excepción capturable dentro del action: pasa
 * antes de que el action exista.
 *
 * Sin nada que lo agarre, ese error sube hasta el error boundary y en
 * `/admincomerz` —que no tenía uno propio— llegaba hasta `global-error.tsx`:
 * pantalla negra y "La aplicación se cortó inesperadamente".
 *
 * Fue exactamente el síntoma del 10/9/2026 con "Probar un mail". Se
 * identificó por descarte y con un dato: los intentos fallidos no dejaron
 * NINGUNA fila en `envios_email`, y esa tabla se escribe en la primera línea
 * del action. Si el action hubiera corrido y fallado después, la fila estaría.
 * Recargar la página lo arregla, y por eso el error parecía aleatorio: le
 * pegaba a la pestaña que llevaba rato abierta, nunca a una recién cargada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE "ARREGLA" REINTENTANDO
 *
 * Reintentar con el mismo bundle vuelve a mandar el mismo ID viejo. Lo único
 * que sirve es recargar, y eso tiene que pedirlo la persona: un
 * `location.reload()` automático en medio de un formulario a medio llenar le
 * borra lo que estaba escribiendo.
 */

const SENIALES = [
  "failed to find server action",
  "server action",
  "deployment",
];

export function esAccionDeVersionVieja(error: unknown): boolean {
  const mensaje =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const texto = mensaje.toLowerCase();

  return SENIALES.some((s) => texto.includes(s));
}

/** Lo que se le dice a la persona. Accionable: la única salida es recargar. */
export const MENSAJE_VERSION_VIEJA =
  "Se actualizó la app mientras tenías esta pestaña abierta. Recargá la página y probá de nuevo.";
