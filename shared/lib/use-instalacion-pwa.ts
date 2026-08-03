"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  detectarMetodoInstalacion,
  leerEntorno,
  type MetodoInstalacion,
} from "./pwa-instalacion";

export interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    deferredPwaPrompt?: BeforeInstallPromptEvent;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

/**
 * Si se puede instalar o no es estado del navegador, no del árbol de React:
 * depende del user agent, del display-mode y de un evento que puede llegar en
 * cualquier momento. Por eso va con useSyncExternalStore y no con
 * useState+useEffect — así no hay un render de más ni riesgo de que la UI
 * quede desincronizada del navegador.
 *
 * getSnapshot tiene que devolver SIEMPRE la misma referencia mientras nada
 * cambie, o React entra en loop infinito. De ahí el cache.
 */
let cache: MetodoInstalacion | null = null;

function invalidar() {
  cache = null;
}

function getSnapshot(): MetodoInstalacion | null {
  if (cache) return cache;
  const entorno = leerEntorno(Boolean(window.deferredPwaPrompt));
  if (!entorno) return null;
  cache = detectarMetodoInstalacion(entorno);
  return cache;
}

/**
 * En el server no hay navegador que consultar. Devolver null hace que el
 * primer render (el que hidrata) coincida con el HTML del server; React
 * re-renderiza solo con el valor real del cliente enseguida después.
 */
function getServerSnapshot(): MetodoInstalacion | null {
  return null;
}

function subscribe(alCambiar: () => void) {
  const notificar = () => {
    invalidar();
    alCambiar();
  };

  const alHaberPrompt = (e: Event) => {
    e.preventDefault();
    window.deferredPwaPrompt = e as BeforeInstallPromptEvent;
    notificar();
  };

  const alInstalar = () => {
    window.deferredPwaPrompt = undefined;
    notificar();
  };

  // Si la instalan desde el menú del navegador no siempre llega
  // `appinstalled`, pero el display-mode cambia igual. Escucharlo mantiene la
  // UI sincronizada en ese caso.
  const mq = window.matchMedia("(display-mode: standalone)");

  window.addEventListener("beforeinstallprompt", alHaberPrompt);
  window.addEventListener("appinstalled", alInstalar);
  mq.addEventListener("change", notificar);

  return () => {
    window.removeEventListener("beforeinstallprompt", alHaberPrompt);
    window.removeEventListener("appinstalled", alInstalar);
    mq.removeEventListener("change", notificar);
  };
}

export function useInstalacionPwa() {
  const metodo = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Lanza el prompt nativo. Sólo tiene sentido con metodo.tipo === "prompt". */
  const instalar = useCallback(async (): Promise<
    "accepted" | "dismissed" | "sin-prompt"
  > => {
    const prompt = window.deferredPwaPrompt;
    if (!prompt) return "sin-prompt";

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      // No siempre llega `appinstalled`, así que se dispara el mismo evento a
      // mano para que el store se entere y la UI deje de ofrecer instalar.
      window.deferredPwaPrompt = undefined;
      window.dispatchEvent(new Event("appinstalled"));
    }
    return outcome;
  }, []);

  return { metodo, instalar };
}
