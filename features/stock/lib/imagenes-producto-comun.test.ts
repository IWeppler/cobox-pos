import { describe, expect, it } from "vitest";
import {
  construirPathsImagen,
  esUrlImagenPropia,
} from "./imagenes-producto-comun";

const SUPABASE = "https://abcdefgh.supabase.co";
const NEGOCIO = "11111111-1111-1111-1111-111111111111";
const OTRO = "22222222-2222-2222-2222-222222222222";
const base = `${SUPABASE}/storage/v1/object/public/productos`;

function archivo(nombre: string, bytes: number): File {
  return { name: nombre, size: bytes } as File;
}

describe("esUrlImagenPropia", () => {
  it("acepta una URL del propio negocio", () => {
    expect(
      esUrlImagenPropia(`${base}/${NEGOCIO}/foto.webp`, NEGOCIO, SUPABASE),
    ).toBe(true);
    expect(
      esUrlImagenPropia(
        `${base}/${NEGOCIO}/thumbs/foto-thumb.webp`,
        NEGOCIO,
        SUPABASE,
      ),
    ).toBe(true);
  });

  it("RECHAZA la carpeta de otro negocio", () => {
    // Es el aislamiento entre comercios: con la subida directa, lo que llega
    // al server son URLs que manda el navegador.
    expect(
      esUrlImagenPropia(`${base}/${OTRO}/foto.webp`, NEGOCIO, SUPABASE),
    ).toBe(false);
  });

  it("rechaza otro host aunque el path sea idéntico", () => {
    expect(
      esUrlImagenPropia(
        `https://malicioso.com/storage/v1/object/public/productos/${NEGOCIO}/f.webp`,
        NEGOCIO,
        SUPABASE,
      ),
    ).toBe(false);
  });

  it("rechaza otro bucket", () => {
    expect(
      esUrlImagenPropia(
        `${SUPABASE}/storage/v1/object/public/logos/${NEGOCIO}/f.webp`,
        NEGOCIO,
        SUPABASE,
      ),
    ).toBe(false);
  });

  it("rechaza intentos de escaparse de la carpeta", () => {
    expect(
      esUrlImagenPropia(
        `${base}/${NEGOCIO}/../${OTRO}/foto.webp`,
        NEGOCIO,
        SUPABASE,
      ),
    ).toBe(false);
  });

  it("rechaza un prefijo que solo PARECE el negocio", () => {
    // `${NEGOCIO}malicioso/` empieza igual pero es otra carpeta.
    expect(
      esUrlImagenPropia(`${base}/${NEGOCIO}malicioso/f.webp`, NEGOCIO, SUPABASE),
    ).toBe(false);
  });

  it("rechaza basura, http y valores que no son URL", () => {
    expect(esUrlImagenPropia("javascript:alert(1)", NEGOCIO, SUPABASE)).toBe(false);
    expect(
      esUrlImagenPropia(
        `http://abcdefgh.supabase.co/storage/v1/object/public/productos/${NEGOCIO}/f.webp`,
        NEGOCIO,
        SUPABASE,
      ),
    ).toBe(false);
    expect(esUrlImagenPropia("", NEGOCIO, SUPABASE)).toBe(false);
    expect(esUrlImagenPropia(null, NEGOCIO, SUPABASE)).toBe(false);
    expect(esUrlImagenPropia(123, NEGOCIO, SUPABASE)).toBe(false);
  });

  it("sin SUPABASE_URL no valida nada (fail-closed)", () => {
    expect(
      esUrlImagenPropia(`${base}/${NEGOCIO}/f.webp`, NEGOCIO, undefined),
    ).toBe(false);
  });
});

describe("construirPathsImagen", () => {
  const uuid = "abc-123";

  it("respeta la convención de carpetas ya guardada en producción", () => {
    const paths = construirPathsImagen(
      NEGOCIO,
      {
        main: archivo("f.webp", 1000),
        thumb: archivo("f-thumb.webp", 100),
        grid: archivo("f-grid.webp", 200),
        master: archivo("f-master.webp", 5000),
      },
      uuid,
    );

    expect(paths.main).toBe(`${NEGOCIO}/${uuid}.webp`);
    expect(paths.thumb).toBe(`${NEGOCIO}/thumbs/${uuid}-thumb.webp`);
    expect(paths.grid).toBe(`${NEGOCIO}/grids/${uuid}-grid.webp`);
    expect(paths.master).toBe(`${NEGOCIO}/masters/${uuid}-master.webp`);
  });

  it("una derivada del tamaño de un original se descarta", () => {
    const paths = construirPathsImagen(
      NEGOCIO,
      {
        main: archivo("f.webp", 1000),
        thumb: archivo("f-thumb.webp", 5 * 1024 * 1024),
        grid: null,
        master: null,
      },
      uuid,
    );

    expect(paths.thumb).toBeNull();
    expect(paths.grid).toBeNull();
    expect(paths.master).toBeNull();
  });

  it("el master tolera más peso que una derivada", () => {
    const dosMb = 2.5 * 1024 * 1024;
    const paths = construirPathsImagen(
      NEGOCIO,
      {
        main: archivo("f.webp", 1000),
        thumb: archivo("t.webp", dosMb),
        master: archivo("m.webp", dosMb),
      },
      uuid,
    );

    // Mismo peso, distinto veredicto: el master existe justamente para ser la
    // copia pesada.
    expect(paths.thumb).toBeNull();
    expect(paths.master).not.toBeNull();
  });
});
