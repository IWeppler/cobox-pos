import { describe, expect, it } from "vitest";
import {
  elegirImagenOg,
  elegirImagenOgConEtiqueta,
  esFormatoSeguroParaPreview,
  extensionDeImagen,
  imagenOgConMime,
  tipoMimeDeImagen,
} from "./og-imagen";

const JPG = "https://cdn.test/productos/uno.jpg";
const WEBP = "https://cdn.test/productos/dos.webp";
const PNG = "https://cdn.test/productos/tres.png";

describe("extensionDeImagen", () => {
  it("saca la extensión ignorando el query string", () => {
    expect(extensionDeImagen(`${JPG}?width=1200`)).toBe("jpg");
  });

  it("normaliza mayúsculas", () => {
    expect(extensionDeImagen("https://cdn.test/A.JPEG")).toBe("jpeg");
  });

  it("devuelve null cuando no hay extensión", () => {
    expect(extensionDeImagen("https://cdn.test/sin-extension")).toBeNull();
    expect(extensionDeImagen(null)).toBeNull();
  });
});

describe("esFormatoSeguroParaPreview", () => {
  it("acepta los formatos que WhatsApp dibuja", () => {
    expect(esFormatoSeguroParaPreview(JPG)).toBe(true);
    expect(esFormatoSeguroParaPreview(PNG)).toBe(true);
  });

  it("rechaza webp — es el que se ve como cuadro en blanco", () => {
    expect(esFormatoSeguroParaPreview(WEBP)).toBe(false);
  });
});

describe("elegirImagenOg", () => {
  it("desarma el array stringificado de imagen_url", () => {
    expect(elegirImagenOg([JSON.stringify([JPG, WEBP])])).toBe(JPG);
  });

  it("mira TODAS las fotos del producto, no solo la primera", () => {
    // Foto 1 webp, foto 2 jpg: el preview usa la 2 en vez de caer al logo.
    expect(elegirImagenOg([JSON.stringify([WEBP, JPG])])).toBe(JPG);
  });

  it("agota las fotos del primer producto antes de pasar al siguiente", () => {
    const otroJpg = "https://cdn.test/productos/segundo.jpg";
    expect(elegirImagenOg([JSON.stringify([WEBP, JPG]), otroJpg])).toBe(JPG);
  });

  it("acepta un string plano (como posLogo)", () => {
    expect(elegirImagenOg([JPG])).toBe(JPG);
  });

  it("prefiere el primer candidato en formato seguro sobre el orden dado", () => {
    expect(elegirImagenOg([WEBP, JPG])).toBe(JPG);
  });

  it("respeta el orden cuando el primero ya es seguro", () => {
    expect(elegirImagenOg([PNG, JPG])).toBe(PNG);
  });

  it("cae a la primera imagen si ninguna es de formato seguro", () => {
    expect(elegirImagenOg([WEBP, "https://cdn.test/otra.webp"])).toBe(WEBP);
  });

  it("ignora candidatos vacíos", () => {
    expect(elegirImagenOg([null, undefined, "", JPG])).toBe(JPG);
  });

  it("devuelve null si no hay ninguna imagen", () => {
    expect(elegirImagenOg([null, undefined, ""])).toBeNull();
    expect(elegirImagenOg([])).toBeNull();
  });
});

describe("elegirImagenOgConEtiqueta", () => {
  it("el alt nombra al dueño de la imagen elegida, no al primer candidato", () => {
    // Caso real de Evens: el primer producto de la selección tiene solo webp,
    // así que el preview muestra la foto del segundo.
    const elegida = elegirImagenOgConEtiqueta([
      { valor: JSON.stringify([WEBP]), alt: "CONJUNTO I-RUN" },
      { valor: JSON.stringify([JPG]), alt: "FUTBOL 5" },
    ]);
    expect(elegida).toEqual({ url: JPG, alt: "FUTBOL 5" });
  });

  it("sin candidatas con imagen devuelve null", () => {
    expect(
      elegirImagenOgConEtiqueta([{ valor: null, alt: "X" }]),
    ).toBeNull();
  });
});

describe("tipoMimeDeImagen / imagenOgConMime", () => {
  it("mapea la extensión al mime", () => {
    expect(tipoMimeDeImagen(JPG)).toBe("image/jpeg");
    expect(tipoMimeDeImagen(WEBP)).toBe("image/webp");
    expect(tipoMimeDeImagen("https://cdn.test/x.svg")).toBeUndefined();
  });

  it("arma la forma que espera openGraph.images", () => {
    expect(imagenOgConMime(JPG, "Buzo")).toEqual([
      { url: JPG, type: "image/jpeg", alt: "Buzo" },
    ]);
  });

  it("sin imagen devuelve undefined, no un array vacío", () => {
    expect(imagenOgConMime(null)).toBeUndefined();
  });
});
