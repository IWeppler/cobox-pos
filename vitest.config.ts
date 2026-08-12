import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` es un paquete que Next resuelve durante el build para
      // hacer fallar la compilación si un módulo de servidor termina en el
      // bundle del cliente. Fuera de Next no existe, así que sin este alias
      // cualquier test que toque un archivo con `import "server-only"` muere
      // al importar — no por el test, por el guard.
      "server-only": path.resolve(__dirname, "shared/testing/server-only.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
