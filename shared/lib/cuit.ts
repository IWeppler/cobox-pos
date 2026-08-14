/**
 * Validación de CUIT/CUIL por dígito verificador (módulo 11).
 *
 * Es la mitad del "autocompletado desde ARCA" que se puede tener HOY, sin
 * certificado ni conexión: no dice quién es el titular, pero atrapa el error
 * que de verdad pasa en el mostrador —un dígito mal tipeado— en el momento en
 * que se tipea, y no dos días después cuando ARCA rechaza la factura.
 *
 * El dígito verificador no es opcional ni decorativo: un CUIT con un número
 * cambiado casi siempre falla esta cuenta. Lo que NO puede saber es si el CUIT
 * existe o a quién pertenece; para eso hace falta el padrón de ARCA.
 */

/** Pesos del módulo 11, aplicados a los 10 primeros dígitos. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Deja solo los dígitos: la gente lo escribe con guiones, puntos o espacios,
 * y rechazar "30-71234567-8" por el formato sería hostil y sin motivo. */
export function normalizarCuit(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * True si el CUIT es válido: 11 dígitos y dígito verificador correcto.
 *
 * Vacío devuelve false. El llamador decide si "sin CUIT" es aceptable — para
 * un cliente no fiscal lo es, y esa decisión no vive acá.
 */
export function esCuitValido(valor: unknown): boolean {
  const cuit = normalizarCuit(valor);
  if (cuit.length !== 11) return false;

  // Un CUIT de todos ceros pasa la cuenta del módulo 11 (suma 0, resto 0,
  // verificador 0) pero no es un CUIT. Se descarta explícitamente.
  if (/^0+$/.test(cuit)) return false;

  const suma = PESOS.reduce(
    (acc, peso, i) => acc + Number(cuit[i]) * peso,
    0,
  );

  const resto = suma % 11;
  // resto 0 → verificador 0; resto 1 → 9 (el caso del prefijo 23); resto n → 11-n.
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;

  return verificador === Number(cuit[10]);
}

/** Formato legible, "30-71234567-8". Devuelve lo que recibió si no tiene los
 * 11 dígitos: formatear a medias un valor incompleto confunde más que ayuda. */
export function formatearCuit(valor: unknown): string {
  const cuit = normalizarCuit(valor);
  if (cuit.length !== 11) return String(valor ?? "");
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

/**
 * Máscara progresiva para tipear: mete los guiones a medida que entran los
 * dígitos, y corta en 11.
 *
 * Existe porque "el formato" fue una barrera real: alguien intentó cargar su
 * CUIT varias veces, leyó "no es válido" y creyó que el problema eran los
 * guiones que faltaban. La lib nunca los pidió —normalizarCuit los descarta—
 * pero el campo tampoco los ponía, así que no había forma de saberlo desde
 * afuera. Con la máscara, el formato deja de ser una pregunta: se escribe
 * solo, y lo único que puede estar mal es el número.
 *
 * A diferencia de formatearCuit, formatea INCOMPLETO a propósito: acá el valor
 * a medio tipear es el caso normal, no una excepción.
 */
export function formatearCuitParcial(valor: unknown): string {
  const cuit = normalizarCuit(valor).slice(0, 11);
  if (cuit.length <= 2) return cuit;
  if (cuit.length <= 10) return `${cuit.slice(0, 2)}-${cuit.slice(2)}`;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

/**
 * Mensaje de error para mostrarle a la cajera, o null si está bien.
 *
 * Distingue "todavía no lo terminaste de escribir" de "está mal", porque en
 * un campo que se valida mientras se tipea el primer caso no es un error. Y
 * cuando está mal dice QUÉ está mal: "no es válido" a secas deja al usuario
 * probando variantes de formato —con guiones, sin guiones— cuando el problema
 * está en los dígitos.
 */
export function errorDeCuit(valor: unknown): string | null {
  const cuit = normalizarCuit(valor);
  if (cuit.length === 0) return null;

  if (cuit.length < 11) {
    const faltan = 11 - cuit.length;
    return faltan === 1
      ? "Falta 1 dígito: un CUIT tiene 11."
      : `Faltan ${faltan} dígitos: un CUIT tiene 11.`;
  }
  if (cuit.length > 11) {
    const sobran = cuit.length - 11;
    return sobran === 1
      ? "Sobra 1 dígito: un CUIT tiene 11."
      : `Sobran ${sobran} dígitos: un CUIT tiene 11.`;
  }
  if (!esCuitValido(cuit)) {
    // El último dígito no es libre: sale de una cuenta sobre los otros diez.
    // Decirlo cambia dónde busca el error quien está tipeando.
    return "Los 11 dígitos están, pero no cierran entre sí. Revisá que no haya ninguno cambiado.";
  }
  return null;
}
