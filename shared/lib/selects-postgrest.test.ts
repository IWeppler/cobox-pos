import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guard contra comentarios adentro de un `select()` de PostgREST.
 *
 * Nace de un incidente real en Evens: alguien documentó unas columnas con
 * comentarios `--` DENTRO del template literal del select en
 * `getStockDetalleProductoAction`. PostgREST no parsea comentarios, y
 * supabase-js además le saca los saltos de línea, así que las seis líneas de
 * explicación se fusionaron en un solo "campo" y la consulta entera empezó a
 * devolver PGRST100 ("failed to parse select parameter"). Resultado: no se
 * podía abrir la ficha de NINGÚN producto, en ninguno de los cuatro negocios.
 *
 * Por qué un test y no una regla de eslint: el string es sintaxis de otro
 * lenguaje adentro de un literal de TypeScript, así que ni el compilador ni el
 * linter lo miran. Nada lo delata hasta que alguien abre la pantalla. Este
 * test es lo único que corre antes.
 *
 * Escanea el repo entero a propósito: el problema no es de un archivo, es de
 * cualquier `select()` que se escriba de acá en adelante. El comentario va
 * SIEMPRE afuera de la llamada.
 */
describe("selects de PostgREST", () => {
  const archivos = execSync('git ls-files "*.ts" "*.tsx"', {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\n")
    .filter(Boolean);

  it("hay archivos para escanear (si no, el test pasa por vacío)", () => {
    expect(archivos.length).toBeGreaterThan(100);
  });

  it("ningún select lleva comentarios adentro del string", () => {
    // `--` y `/* */` son comentarios de SQL/JS; ninguno es sintaxis válida de
    // un select de PostgREST, donde los campos son [a..z0..9_$], `*`, alias
    // con `:` y embeds con paréntesis.
    const problemas: string[] = [];

    for (const archivo of archivos) {
      const fuente = readFileSync(archivo, "utf8");
      const selects = /\.select\(\s*`([\s\S]*?)`/g;
      let coincidencia: RegExpExecArray | null;

      while ((coincidencia = selects.exec(fuente)) !== null) {
        const cuerpo = coincidencia[1];
        if (!/--|\/\*|\/\//.test(cuerpo)) continue;

        const linea = fuente.slice(0, coincidencia.index).split("\n").length;
        problemas.push(`${archivo}:${linea}`);
      }
    }

    expect(
      problemas,
      `Hay comentarios adentro del string de un select. PostgREST no los ` +
        `parsea: la consulta vuelve PGRST100 y la pantalla no carga. ` +
        `Mové la explicación afuera de la llamada .select().\n` +
        problemas.map((p) => `  - ${p}`).join("\n"),
    ).toEqual([]);
  });
});
