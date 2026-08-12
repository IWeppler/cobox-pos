import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tagCatalogo } from "./cache-catalogo";

const FUENTE = readFileSync(
  join(import.meta.dirname, "cache-catalogo.ts"),
  "utf8",
);

describe("tagCatalogo", () => {
  it("es distinto por negocio", () => {
    // Si dos negocios compartieran tag, invalidar uno limpiaría el catálogo
    // del otro — molesto pero inofensivo. Lo grave es lo de abajo.
    expect(tagCatalogo("neg-1")).not.toBe(tagCatalogo("neg-2"));
    expect(tagCatalogo("neg-1")).toContain("neg-1");
  });
});

/**
 * Esta base es multi-tenant y la consulta cacheada devuelve el catálogo de UN
 * comercio. Si la clave de `unstable_cache` no incluye el negocio, el primero
 * que entre calienta el cache y TODOS los demás ven sus productos y sus
 * precios. No tira ningún error: simplemente un comercio muestra la mercadería
 * de otro.
 *
 * No hay forma de observar la clave desde afuera —`unstable_cache` no la
 * expone— así que se verifica sobre el texto. Es feo y es a propósito: la
 * alternativa es no tener red debajo del único bug que acá no se puede cometer.
 */
describe("clave del cache", () => {
  it("incluye el negocioId", () => {
    const llamada = FUENTE.match(/unstable_cache\([\s\S]*?\)\(\);/);
    expect(llamada, "no se encontró la llamada a unstable_cache").not.toBeNull();

    const clave = llamada![0].match(/\[[^\]]*"catalogo-productos"[^\]]*\]/);
    expect(clave, "no se encontró el array de clave").not.toBeNull();
    expect(clave![0]).toContain("negocioId");
  });

  it("el tag también lleva el negocio", () => {
    expect(FUENTE).toMatch(/tags:\s*\[tagCatalogo\(negocioId\)\]/);
  });

  it("NO cachea el camino del POS (conCostos)", () => {
    // El POS vende contra este stock: cachearlo es vender lo que ya no está.
    const llamada = FUENTE.match(/unstable_cache\([\s\S]*?\)\(\);/)![0];
    expect(llamada).toContain("conCostos: false");
    expect(llamada).not.toMatch(/conCostos:\s*true/);
  });

  it("no lee headers ni cookies adentro del cache", () => {
    // Next lo prohíbe (una función cacheada no puede depender de la request), y
    // el motivo de fondo es peor: sería cachear datos de una sesión y
    // servírselos a otra.
    const llamada = FUENTE.match(/unstable_cache\([\s\S]*?\)\(\);/)![0];
    expect(llamada).not.toMatch(/\bheaders\(\)/);
    expect(llamada).not.toMatch(/\bcookies\(\)/);
  });
});
