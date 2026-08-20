/**
 * Distinguir "se cortó la conexión" de "la app se rompió".
 *
 * Existe por un caso concreto: la dueña de Evens subía una foto desde el
 * celular y la app entera se ponía en negro con "Algo salió mal — la
 * aplicación se cortó inesperadamente". No se había roto nada: el POST de la
 * Server Action con la imagen murió en la red (datos móviles, o Android
 * suspendiendo la PWA en segundo plano), `fetch` tiró `TypeError: Failed to
 * fetch`, y como el único error boundary de la app era `global-error.tsx`, un
 * parpadeo de señal reemplazaba el `<html>` entero.
 *
 * Que un corte de red se vea igual que un crash tiene un costo real: la
 * persona deja de confiar en el sistema justo cuando el sistema estaba bien.
 *
 * OJO con lo que este módulo NO puede saber: si el request llegó al servidor y
 * lo que se perdió fue la respuesta. `Failed to fetch` no distingue las dos
 * cosas. Por eso los mensajes hablan de reintentar y nunca afirman "no se
 * guardó nada" — decirlo sería adivinar sobre plata o mercadería.
 */

/**
 * Mensajes de fallo de TRANSPORTE, por navegador. No hay un código de error
 * estándar para esto: `fetch` rechaza con un `TypeError` cuyo `message` cambia
 * según el motor, así que se compara por texto.
 */
const MENSAJES_DE_RED = [
  "failed to fetch", // Chrome, Edge, Samsung Browser
  "networkerror", // Firefox
  "load failed", // Safari / WebKit
  "network request failed",
  "the internet connection appears to be offline", // Safari iOS
  "connection was lost",
  "err_internet_disconnected",
  "err_network_changed", // cambio de wifi a datos a mitad del request
  "err_connection_closed",
];

/**
 * Si el error es un fallo de conexión y no un error de la aplicación.
 *
 * Fail-closed hacia "no es de red": ante la duda conviene tratarlo como un
 * error real y que quede reportado, no esconder un bug detrás de un cartel de
 * "revisá la conexión".
 */
export function esErrorDeRed(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  const mensaje =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";

  if (!mensaje) return false;

  const normalizado = mensaje.toLowerCase();
  return MENSAJES_DE_RED.some((patron) => normalizado.includes(patron));
}

/**
 * Qué mostrarle a quien está en el mostrador.
 *
 * `accion` es lo que la persona estaba haciendo, en infinitivo y en sus
 * palabras ("guardar el producto", "registrar la venta"), para que el mensaje
 * diga qué reintentar en vez de un genérico que no orienta.
 */
export function mensajeErrorDeRed(accion: string): string {
  const sinConexion =
    typeof navigator !== "undefined" && navigator.onLine === false;

  return sinConexion
    ? `Te quedaste sin conexión y no se pudo ${accion}. Revisá la señal y volvé a intentar.`
    : `Se cortó la conexión y no se pudo ${accion}. Volvé a intentar en unos segundos.`;
}
