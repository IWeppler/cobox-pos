/**
 * Contacto de Comerz.
 *
 * Estaba repetido a mano en siete lugares (las páginas legales y el layout
 * legal). Acá queda uno solo para lo nuevo; migrar los otros es un cambio
 * aparte y sin urgencia.
 */
export const EMAIL_COMERZ = "ignacionweppler@gmail.com";

/** `mailto:` con asunto ya armado, para que el mail llegue identificable. */
export function mailtoComerz(asunto: string, cuerpo?: string): string {
  const params = new URLSearchParams({ subject: asunto });
  if (cuerpo) params.set("body", cuerpo);
  return `mailto:${EMAIL_COMERZ}?${params.toString()}`;
}
