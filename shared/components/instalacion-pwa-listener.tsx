"use client";

import { useEffect } from "react";
import type { BeforeInstallPromptEvent } from "@/shared/lib/use-instalacion-pwa";

/**
 * Guarda el evento `beforeinstallprompt` apenas llega.
 *
 * El navegador lo dispara una sola vez y temprano, muy posiblemente antes de
 * que el usuario abra el panel donde está el botón de instalar. Antes esto
 * vivía como efecto de módulo en preferences-panel.tsx, así que el evento sólo
 * se capturaba si esa pantalla ya se había cargado: en la primera visita se
 * perdía y el botón no aparecía nunca.
 *
 * Va montado en el layout raíz para escuchar desde el primer render.
 */
export function InstalacionPwaListener() {
  useEffect(() => {
    const alHaberPrompt = (e: Event) => {
      e.preventDefault();
      window.deferredPwaPrompt = e as BeforeInstallPromptEvent;
    };

    window.addEventListener("beforeinstallprompt", alHaberPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", alHaberPrompt);
  }, []);

  return null;
}
