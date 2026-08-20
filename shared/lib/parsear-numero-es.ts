/**
 * Parseo de números tipeados por una persona en un mostrador argentino.
 *
 * Existe porque `Number("0,75")` es `NaN` y `Number("2.000")` es `2`, y las dos
 * cosas se tipean todo el tiempo. Son DOS funciones y no una porque el mismo
 * texto significa cosas distintas según el campo, y esa ambigüedad no se puede
 * resolver adivinando:
 *
 *   "1.500" en un campo de PESO    → 1,5 kg   (nadie vende 1.500 kilos)
 *   "1.500" en un campo de IMPORTE → $1.500   (nadie cobra un peso con medio)
 *
 * Elegir mal el separador acá es cobrar mil veces de más o de menos, así que
 * cada campo usa la función que corresponde a lo que se está tipeando.
 */

/**
 * Cantidad: punto y coma son los dos separador DECIMAL.
 *
 * "0,75" y "0.75" son 0,75. No existe el separador de miles: una cantidad con
 * miles (1.500 kg) no se tipea en un mostrador, y aceptarlo obligaría a
 * adivinar entre 1,5 y 1500.
 */
export function parsearCantidadEs(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "").replace(",", ".");
  if (limpio === "") return null;
  // Un solo separador decimal y solo dígitos alrededor. Rechaza "1.2.3".
  if (!/^\d*\.?\d*$/.test(limpio)) return null;

  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Importe: el punto es separador de MILES y la coma es el decimal, que es como
 * se escribe la plata en Argentina ("$1.234,50").
 */
export function parsearImporteEs(texto: string): number | null {
  const limpio = texto
    .trim()
    .replace(/\s/g, "")
    .replace(/^\$/, "")
    .replaceAll(".", "")
    .replace(",", ".");
  if (limpio === "") return null;
  if (!/^\d*\.?\d*$/.test(limpio)) return null;

  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}
