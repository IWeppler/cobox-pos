import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light", // Tema por defecto
      setTheme: (theme) => {
        set({ theme });
        const root = document.documentElement;

        if (theme === "dark") {
          root.classList.add("dark");
        } else if (theme === "light") {
          root.classList.remove("dark");
        } else {
          // Lógica para tema del sistema
          if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            root.classList.add("dark");
          } else {
            root.classList.remove("dark");
          }
        }
      },
      initTheme: () => {
        // Esta función se llama al cargar la app para aplicar el tema persistido
        const { theme } = get();
        const root = document.documentElement;

        if (theme === "dark") {
          root.classList.add("dark");
        } else if (theme === "light") {
          root.classList.remove("dark");
        } else {
          if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            root.classList.add("dark");
          } else {
            root.classList.remove("dark");
          }
        }
      },
    }),
    {
      name: "theme-storage",
    },
  ),
);
