import { describe, expect, it } from "vitest";
import { pathDesdeUrlPublica } from "./borrar-imagenes-producto";

const BASE = "https://pwrvyfavqkyyprdgyxuk.supabase.co/storage/v1/object/public/productos/";
const NEG = "44468525-8381-4c83-a558-eb7209e386b5";

describe("pathDesdeUrlPublica", () => {
  it("saca el path de las cuatro versiones de una imagen", () => {
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/abc.webp`)).toBe(`${NEG}/abc.webp`);
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/thumbs/abc-thumb.webp`)).toBe(
      `${NEG}/thumbs/abc-thumb.webp`,
    );
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/grids/abc-grid.webp`)).toBe(
      `${NEG}/grids/abc-grid.webp`,
    );
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/masters/abc-master.webp`)).toBe(
      `${NEG}/masters/abc-master.webp`,
    );
  });

  it("ignora querystring y fragmento", () => {
    // Storage los ignora al servir, pero formarían parte del path al borrar y
    // no matchearía ningún archivo.
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/abc.webp?width=200`)).toBe(
      `${NEG}/abc.webp`,
    );
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/abc.webp#x`)).toBe(`${NEG}/abc.webp`);
  });

  it("decodifica el nombre con espacios o acentos", () => {
    expect(pathDesdeUrlPublica(`${BASE}${NEG}/foto%20de%20campera.jpg`)).toBe(
      `${NEG}/foto de campera.jpg`,
    );
  });

  it("devuelve null para todo lo que no sea una URL de ESTE bucket", () => {
    // El caso peligroso: parsear de más y devolver un path que borra otra cosa.
    expect(pathDesdeUrlPublica("https://otro.com/imagen.jpg")).toBeNull();
    expect(
      pathDesdeUrlPublica(
        "https://x.supabase.co/storage/v1/object/public/logos/abc.png",
      ),
    ).toBeNull();
    expect(pathDesdeUrlPublica(`${BASE}`)).toBeNull();
    expect(pathDesdeUrlPublica("")).toBeNull();
    expect(pathDesdeUrlPublica(null)).toBeNull();
    expect(pathDesdeUrlPublica(undefined)).toBeNull();
    expect(pathDesdeUrlPublica(42)).toBeNull();
  });

  it("rechaza un path con .. que apunte fuera de la carpeta del negocio", () => {
    expect(
      pathDesdeUrlPublica(`${BASE}${NEG}/../otro-negocio/abc.webp`),
    ).toBeNull();
  });
});
