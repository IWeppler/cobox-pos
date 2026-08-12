import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La cookie de sesión tiene que quedar HOST-ONLY: pegada a app.comerz.app y a
 * ningún otro host.
 *
 * Hoy eso es verdad por OMISIÓN — `DEFAULT_COOKIE_OPTIONS` de @supabase/ssr no
 * trae `domain`, así que el browser la ata al host que respondió. El día que
 * alguien agregue `cookieOptions: { domain: ".comerz.app" }` pensando en
 * "compartir la sesión entre subdominios", la sesión de la dueña se empieza a
 * mandar a los catálogos públicos de los 4 negocios, que son páginas que sirve
 * cualquiera. No hay nada en el tipo ni en el linter que lo frene, así que lo
 * frena esto.
 *
 * Es un test sobre el TEXTO del archivo a propósito: lo que hay que impedir es
 * que la opción aparezca, y no hay forma de observarla desde afuera sin montar
 * un browser.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..");

const ARCHIVOS_QUE_SETEAN_COOKIES = [
  "middleware.ts",
  "shared/config/supabase/server.ts",
  "shared/config/supabase/client.ts",
];

describe("dominio de la cookie de sesión", () => {
  it.each(ARCHIVOS_QUE_SETEAN_COOKIES)(
    "%s no fija un domain en las cookies",
    (ruta) => {
      const fuente = readFileSync(join(RAIZ, ruta), "utf8");

      // Se buscan las formas reales de escribirlo, no la palabra suelta: en un
      // comentario ("sin `domain`, la cookie queda host-only") tiene que poder
      // aparecer, porque explicar por qué no está es parte del punto.
      const sinComentarios = fuente
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(sinComentarios).not.toMatch(/\bdomain\s*:/);
      expect(sinComentarios).not.toMatch(/\bcookieOptions\b/);
    },
  );
});

describe("cliente del catálogo público", () => {
  it("no usa createBrowserClient, que mandaría la sesión", () => {
    const fuente = readFileSync(
      join(RAIZ, "features/store/components/cart-panel-publico.tsx"),
      "utf8",
    );

    // El catálogo se sirve igual para todos: siempre anon, siempre por slug.
    // Con sesión, un visitante logueado deja de ser `anon`, la RLS evalúa la
    // restrictive de `authenticated` y devuelve cero filas (incidente 2/8).
    expect(fuente).toContain("createPublicBrowserClient");
    expect(fuente).not.toMatch(/\bcreateClient\b/);
  });
});
