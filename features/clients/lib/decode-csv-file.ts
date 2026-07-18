/**
 * Decodifica el contenido crudo de un archivo CSV probando UTF-8 primero
 * (con `fatal: true`, así una secuencia de bytes inválida en UTF-8 tira un
 * error en vez de colarse como U+FFFD en silencio) y cayendo a
 * windows-1252 si falla — el encoding típico de un CSV exportado por Excel
 * en configuración regional española (Ñ, tildes fuera del rango ASCII).
 * windows-1252 nunca falla (asigna un carácter a cada byte 0x00-0xFF), por
 * eso es un fallback seguro y no un tercer intento con `fatal`.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}
