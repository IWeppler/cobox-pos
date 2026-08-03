import { useEffect, useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import {
  Download,
  Sparkles,
} from "lucide-react";

const isRunningStandalone = () => {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

export function InstallAppWidget({
  isCollapsed,
}: Readonly<{ isCollapsed: boolean }>) {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(isRunningStandalone);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (!isRunningStandalone()) setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  if (isStandalone || !installPrompt) return null;

  return (
    <div
      className={`transition-all duration-300 ${isCollapsed ? "" : "bg-linear-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-3 shadow-sm"}`}
    >
      {isCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => installPrompt.prompt()}
              className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 hover:bg-indigo-200 transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Instalar App</TooltipContent>
        </Tooltip>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-white dark:bg-indigo-900 flex items-center justify-center shadow-sm shrink-0 border border-indigo-50 dark:border-indigo-800">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-semibold uppercase tracking-wider">
                App Nativa
              </p>
              <p className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                Instalar Comerz
              </p>
            </div>
          </div>
          <p className="text-xs text-indigo-900/70 dark:text-indigo-200/70 mb-3 leading-snug">
            Obtén la experiencia de pantalla completa y mayor velocidad.
          </p>
          <button
            onClick={() => installPrompt.prompt()}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white border border-indigo-200 dark:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500 rounded-lg py-1.5 text-sm font-bold transition-colors shadow-sm active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            Instalar ahora
          </button>
        </>
      )}
    </div>
  );
}
