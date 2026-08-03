/**
 * Cómo se instala la app según el navegador.
 *
 * El problema que resuelve: los dos widgets de instalación colgaban de
 * `beforeinstallprompt`, un evento que existe sólo en Chromium. Safari no lo
 * dispara nunca y no tiene API de instalación, así que en iPhone no aparecía
 * ningún botón — que es exactamente lo que reportaron los usuarios. En iOS la
 * única forma de instalar es a mano, desde el menú Compartir, y eso hay que
 * explicarlo en pantalla porque no lo adivina nadie.
 *
 * Peor todavía: adentro del navegador embebido de WhatsApp o Instagram (que es
 * como llega la mayoría a un link) el menú Compartir de iOS ni siquiera tiene
 * la opción. Ahí no hay nada que instalar hasta que abran el link en Safari,
 * así que ese caso se detecta aparte y se dice qué hacer.
 */

export type MetodoInstalacion =
  /** Ya está instalada y corriendo como app. No hay nada que ofrecer. */
  | { tipo: "instalada" }
  /** Chromium: hay prompt nativo, se instala con un click. */
  | { tipo: "prompt" }
  /** iOS en Safari: se instala a mano desde Compartir. Hay que explicarlo. */
  | { tipo: "ios-manual" }
  /**
   * Navegador embebido (WhatsApp, Instagram, Facebook). No se puede instalar
   * desde acá: primero hay que abrir el link en el navegador de verdad.
   */
  | { tipo: "abrir-en-navegador"; navegador: "safari" | "chrome" }
  /** No se puede instalar y no hay nada útil que decir. */
  | { tipo: "no-disponible" };

interface Entorno {
  userAgent: string;
  /** `navigator.standalone`, propiedad sólo de Safari iOS. */
  standalone?: boolean;
  /** Resultado de matchMedia("(display-mode: standalone)"). */
  displayModeStandalone: boolean;
  /** Si ya llegó el evento beforeinstallprompt. */
  hayPrompt: boolean;
  maxTouchPoints?: number;
}

/**
 * iPad se hace pasar por Mac desde iPadOS 13: el user agent dice "Macintosh"
 * y no hay ningún "iPad" en el string. Lo que lo delata es que un Mac de
 * verdad no reporta puntos táctiles.
 */
export function esIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Navegadores embebidos en otras apps. Se listan por lo que ponen en el user
 * agent: FBAN/FBAV son Facebook, y WhatsApp e Instagram se nombran solos.
 */
export function esNavegadorEmbebido(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger/i.test(userAgent);
}

/**
 * En iOS todos los navegadores son Safari por dentro (usan WebKit), pero sólo
 * Safari expone "Añadir a pantalla de inicio". Chrome y Firefox en iPhone no
 * pueden instalar, así que mandarlos a Compartir sería mentirles.
 */
export function esSafariEnIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (!esIOS(userAgent, maxTouchPoints)) return false;
  if (esNavegadorEmbebido(userAgent)) return false;
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPT = Opera.
  return !/CriOS|FxiOS|EdgiOS|OPT\//i.test(userAgent);
}

export function detectarMetodoInstalacion(entorno: Entorno): MetodoInstalacion {
  const { userAgent, maxTouchPoints = 0 } = entorno;

  // Primero lo instalado: si ya corre como app no importa nada más.
  if (entorno.displayModeStandalone || entorno.standalone === true) {
    return { tipo: "instalada" };
  }

  if (esNavegadorEmbebido(userAgent)) {
    return {
      tipo: "abrir-en-navegador",
      navegador: esIOS(userAgent, maxTouchPoints) ? "safari" : "chrome",
    };
  }

  // El prompt nativo va antes que la explicación manual: si Chromium lo
  // ofrece, un click siempre le gana a cinco pasos.
  if (entorno.hayPrompt) return { tipo: "prompt" };

  if (esSafariEnIOS(userAgent, maxTouchPoints)) return { tipo: "ios-manual" };

  return { tipo: "no-disponible" };
}

/** Lee el entorno del browser. Devuelve null en el server. */
export function leerEntorno(hayPrompt: boolean): Entorno | null {
  if (typeof window === "undefined") return null;
  return {
    userAgent: navigator.userAgent,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)")
      .matches,
    hayPrompt,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}
