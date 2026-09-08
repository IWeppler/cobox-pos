import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guard contra `signOut()` sin `scope`.
 *
 * El default de supabase-js es `scope: 'global'`: cierra TODAS las sesiones del
 * usuario, en todos sus dispositivos. En este producto eso no es un detalle —
 * medido el 7/9/2026, Mara tenía 6 sesiones vivas, Evelyn 4 y Zunilda 3, porque
 * cada persona usa el celular del local, el propio y la PWA instalada (que en
 * iOS guarda sus cookies aparte de Safari).
 *
 * Lo que hace un logout global es dejar a los otros dispositivos con las
 * cookies puestas y un access token que sigue verificando bien hasta 1 h contra
 * una sesión que ya no existe. De ahí salió el loop de redirects de Estilo
 * Bonito (ver `shared/lib/salir-sesion.ts`), y en el mejor de los casos echa de
 * la app a una caja que está vendiendo.
 *
 * Por qué un test y no una revisión: el default es INVISIBLE. `signOut()` a
 * secas se lee como "cerrar la sesión" y hace algo bastante más grande; nada en
 * el código lo delata. Escribir el scope siempre —incluso `'global'`, cuando
 * de verdad se quiera cerrar todo— obliga a que la decisión sea explícita.
 */
describe("scope de signOut", () => {
  const archivos = execSync('git ls-files "*.ts" "*.tsx"', {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\n")
    .filter(Boolean)
    .filter((archivo) => !archivo.endsWith(".test.ts"))
    .filter((archivo) => existsSync(archivo));

  it(
    "toda llamada a signOut declara su alcance",
    () => {
      const problemas: string[] = [];

      for (const archivo of archivos) {
        const fuente = readFileSync(archivo, "utf8");
        const llamadas = /auth\.signOut\(([^)]*)\)/g;
        let coincidencia: RegExpExecArray | null;

        while ((coincidencia = llamadas.exec(fuente)) !== null) {
          if (coincidencia[1].includes("scope")) continue;

          const linea = fuente.slice(0, coincidencia.index).split("\n").length;
          problemas.push(`${archivo}:${linea}`);
        }
      }

      expect(
        problemas,
        `Hay un signOut() sin scope. El default es 'global' y cierra la ` +
          `sesión del usuario en TODOS sus dispositivos, incluida la caja que ` +
          `está vendiendo. Poné scope: 'local' (o 'global' a propósito).\n` +
          problemas.map((p) => `  - ${p}`).join("\n"),
      ).toEqual([]);
    },
    // El `git ls-files` de arriba es I/O y con la suite entera corriendo en
    // paralelo se pasa del default de 5 s. Es lento, no colgado.
    20_000,
  );
});
