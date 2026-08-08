/**
 * Migas de pan para detectar crasheos que NO dejan excepción.
 *
 * Cuando el navegador mata la pestaña por falta de memoria no hay `error` ni
 * `unhandledrejection` que capturar: el proceso simplemente desaparece. La
 * única forma de enterarse es dejar una marca ANTES de la operación pesada y
 * borrarla al terminar; si al cargar la página aparece una marca vieja sin
 * borrar, esa sesión se murió a la mitad.
 *
 * sessionStorage y no localStorage: la marca tiene que morir con la pestaña,
 * no quedar dando vueltas entre sesiones distintas.
 */

const CLAVE = "comerz:operacion-en-curso";

export type OperacionEnCurso = {
  nombre: string;
  iniciadaEn: number;
  detalle?: Record<string, unknown>;
};

export function marcarInicioOperacion(
  nombre: string,
  detalle?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    const marca: OperacionEnCurso = {
      nombre,
      iniciadaEn: Date.now(),
      detalle,
    };
    sessionStorage.setItem(CLAVE, JSON.stringify(marca));
  } catch {
    // sessionStorage puede estar bloqueado (modo privado, permisos). No es
    // motivo para romper la operación que se está por hacer.
  }
}

export function marcarFinOperacion(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Idem.
  }
}

/** Devuelve la operación que quedó sin cerrar (y la limpia), o null. */
export function tomarOperacionSinCerrar(): OperacionEnCurso | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    sessionStorage.removeItem(CLAVE);
    return JSON.parse(crudo) as OperacionEnCurso;
  } catch {
    return null;
  }
}
