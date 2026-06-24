"use client";

import { useState, useEffect } from "react";
import { Button } from "@/shared/ui/button";
import {
  Moon,
  Sun,
  Download,
  MonitorSmartphone,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useThemeStore } from "@/shared/store/theme-store";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
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

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.deferredPwaPrompt = e as BeforeInstallPromptEvent;
  });
}

const isPwaInstalled = () => {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
};

const getDeferredPwaPrompt = () => {
  if (typeof window === "undefined") return null;
  return window.deferredPwaPrompt ?? null;
};

export function PreferencesPanel() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, initTheme } = useThemeStore();

  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(getDeferredPwaPrompt);
  const [isInstalled, setIsInstalled] = useState(isPwaInstalled);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      // Aplicamos el tema guardado en Zustand al DOM apenas monta el panel
      initTheme();
      setDeferredPrompt(getDeferredPwaPrompt());
    }, 0);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const pwaEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(pwaEvent);
      window.deferredPwaPrompt = pwaEvent;
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [initTheme]);

  const handleInstallClick = async () => {
    if (isInstalled) return;

    if (!deferredPrompt) {
      toast.info("Instalación manual requerida", {
        description:
          "En tu navegador actual debes ir al menú (tres puntos) y seleccionar 'Instalar aplicación' / 'Añadir a pantalla de inicio'.",
      });
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstalled(true);
      toast.success("¡Aplicación instalada con éxito!");
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Preferencias
        </h2>
        <p className="text-muted-foreground text-sm">
          Personaliza la apariencia de la plataforma y gestiona la aplicación
          instalable.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TEMA VISUAL */}
        <div className="bg-card p-6 rounded-2xl border border-border flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4">
              {theme === "dark" ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              Tema Visual
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Elige entre el modo claro para el día o el modo oscuro para
              ambientes con poca luz.
            </p>
          </div>

          <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50">
            <button
              onClick={() => setTheme("light")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                theme === "light"
                  ? "bg-background shadow-sm text-foreground ring-1 ring-black/5 dark:ring-white/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sun className="w-4 h-4" /> Claro
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                theme === "dark"
                  ? "bg-background shadow-sm text-foreground ring-1 ring-black/5 dark:ring-white/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon className="w-4 h-4" /> Oscuro
            </button>
            <button
              onClick={() => setTheme("system")}
              className={`flex-1 items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hidden sm:flex ${
                theme === "system"
                  ? "bg-background shadow-sm text-foreground ring-1 ring-black/5 dark:ring-white/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MonitorSmartphone className="w-4 h-4" /> Auto
            </button>
          </div>
        </div>

        {/* INSTALACIÓN PWA */}
        <div className="bg-card p-6 rounded-2xl border border-border flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-4">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              Instalar Aplicación (PWA)
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Instala el sistema POS en tu dispositivo para acceder rápidamente
              desde tu pantalla de inicio, sin distracciones del navegador.
            </p>
          </div>

          <Button
            onClick={handleInstallClick}
            disabled={isInstalled}
            className={`w-full font-semibold h-11 rounded-xl shadow-none uppercase tracking-widest text-xs transition-all ${
              isInstalled
                ? "bg-emerald-50 text-emerald-700"
                : deferredPrompt
                  ? "bg-accent-lime hover:bg-emerald-700 text-white"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {isInstalled ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" /> App ya instalada
              </>
            ) : deferredPrompt ? (
              "Instalar App ahora"
            ) : (
              "Instalación Manual / iOS"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
