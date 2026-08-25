/**
 * Pasa un teléfono argentino como se carga en el POS al formato que necesita
 * un link de wa.me.
 *
 * Por qué hace falta una función y no un `replace`: los teléfonos vienen
 * guardados en formato LOCAL. Medido sobre los 105 clientes de Evens que
 * tienen teléfono, ninguno arranca con "+" ni con "54", y 101 son exactamente
 * 10 dígitos ("1154702118"). Un link a `wa.me/1154702118` no abre el chat de
 * esa persona: abre cualquier cosa, o nada.
 *
 * WhatsApp pide, para un celular argentino, `54` + `9` + área + número, o sea
 * 13 dígitos. El `9` es el que distingue un celular de una línea fija y es el
 * error clásico: sin él el mensaje no llega y no avisa.
 *
 * FAIL-CLOSED: si el número no es reconocible como celular argentino devuelve
 * null, y quien llama abre WhatsApp sin destinatario para que la dueña elija
 * el contacto a mano. Es preferible a mandarle el resumen de cuenta de una
 * clienta a un número equivocado.
 */
export function telefonoAWhatsapp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;

  let digitos = telefono.replace(/\D/g, "");
  if (!digitos) return null;

  // Prefijo de país, si ya viene puesto.
  if (digitos.startsWith("54")) digitos = digitos.slice(2);
  // El 9 de celular: se saca acá y se vuelve a poner al final, así da igual si
  // el número guardado ya lo tenía.
  if (digitos.startsWith("9")) digitos = digitos.slice(1);
  // Prefijo nacional de larga distancia (el 0 de "011").
  if (digitos.startsWith("0")) digitos = digitos.slice(1);

  // Área + número, sin el 15. Un celular argentino son 10 dígitos exactos:
  // 11 + 8 en AMBA, 4 + 6 o 3 + 7 en el interior.
  //
  // El "15" viejo NO se intenta limpiar a propósito: "1115..." puede ser un
  // celular de CABA con 15 o el arranque de otro número, y adivinar mal manda
  // el mensaje a un desconocido. Esos casos caen en null.
  if (digitos.length !== 10) return null;

  return `549${digitos}`;
}

/**
 * Link de WhatsApp con el mensaje ya cargado.
 *
 * Sin teléfono reconocible el link va SIN destinatario (`wa.me/?text=`): abre
 * WhatsApp con el mensaje escrito y la dueña elige a quién mandárselo. Es el
 * mismo patrón que ya usa el ticket de venta para compartir un recibo.
 */
export function linkWhatsapp(
  telefono: string | null | undefined,
  mensaje: string,
): string {
  const destino = telefonoAWhatsapp(telefono);
  const texto = encodeURIComponent(mensaje);
  return destino ? `https://wa.me/${destino}?text=${texto}` : `https://wa.me/?text=${texto}`;
}
