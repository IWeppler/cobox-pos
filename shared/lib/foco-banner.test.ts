import { describe, expect, it } from "vitest";
import {
  FOCO_CENTRADO,
  normalizarCoordenadaFoco,
  objectPositionDeFoco,
  tieneFoco,
  ventanaVisible,
} from "./foco-banner";

describe("normalizarCoordenadaFoco", () => {
  it("recorta a 0-100", () => {
    expect(normalizarCoordenadaFoco(-30)).toBe(0);
    expect(normalizarCoordenadaFoco(140)).toBe(100);
    expect(normalizarCoordenadaFoco(37)).toBe(37);
  });

  // La columna es smallint: un decimal lo truncaría la base y la pantalla
  // mostraría un número distinto del guardado.
  it("redondea, porque la columna es entera", () => {
    expect(normalizarCoordenadaFoco(33.6)).toBe(34);
  });

  // Null significa "centrado", no "pegado al borde izquierdo".
  it("lo que no es número finito sale como null, nunca como 0", () => {
    expect(normalizarCoordenadaFoco(null)).toBeNull();
    expect(normalizarCoordenadaFoco(undefined)).toBeNull();
    expect(normalizarCoordenadaFoco(NaN)).toBeNull();
    expect(normalizarCoordenadaFoco(Infinity)).toBeNull();
  });
});

describe("objectPositionDeFoco", () => {
  it("sin foco devuelve el centro, que es el default de CSS", () => {
    expect(objectPositionDeFoco(null)).toBe(FOCO_CENTRADO);
    expect(objectPositionDeFoco({ x: null, y: null })).toBe(FOCO_CENTRADO);
  });

  it("arma el par en porcentajes", () => {
    expect(objectPositionDeFoco({ x: 20, y: 80 })).toBe("20% 80%");
  });

  // Mover solo la vertical no puede tirar la imagen contra un costado.
  it("centra el eje que falta en vez de pegarlo al borde", () => {
    expect(objectPositionDeFoco({ x: null, y: 30 })).toBe("50% 30%");
    expect(objectPositionDeFoco({ x: 30, y: null })).toBe("30% 50%");
  });
});

describe("tieneFoco", () => {
  it("distingue encuadrado a mano de nunca tocado", () => {
    expect(tieneFoco(null)).toBe(false);
    expect(tieneFoco({ x: null, y: null })).toBe(false);
    expect(tieneFoco({ x: 0, y: null })).toBe(true);
  });
});

describe("ventanaVisible", () => {
  // Una foto apaisada dentro del hero alto del celular: entra toda la altura
  // y se recorta a los costados.
  it("imagen más ancha que el marco: recorta los costados", () => {
    const v = ventanaVisible({
      proporcionImagen: 2,
      proporcionMarco: 1,
      foco: null,
    });

    expect(v.alto).toBe(100);
    expect(v.ancho).toBe(50);
    // Centrado: la mitad del sobrante de cada lado.
    expect(v.x).toBe(25);
    expect(v.y).toBe(0);
  });

  it("imagen más alta que el marco: recorta arriba y abajo", () => {
    const v = ventanaVisible({
      proporcionImagen: 1,
      proporcionMarco: 2,
      foco: null,
    });

    expect(v.ancho).toBe(100);
    expect(v.alto).toBe(50);
    expect(v.y).toBe(25);
  });

  it("el foco corre la ventana hacia ese lado", () => {
    const izquierda = ventanaVisible({
      proporcionImagen: 2,
      proporcionMarco: 1,
      foco: { x: 0, y: 50 },
    });
    const derecha = ventanaVisible({
      proporcionImagen: 2,
      proporcionMarco: 1,
      foco: { x: 100, y: 50 },
    });

    expect(izquierda.x).toBe(0);
    expect(derecha.x).toBe(50);
  });

  // El rectángulo no puede salirse de la imagen: `object-position` tampoco
  // deja ver más allá del borde.
  it("la ventana siempre queda adentro de la imagen", () => {
    for (const x of [0, 25, 50, 75, 100]) {
      const v = ventanaVisible({
        proporcionImagen: 3,
        proporcionMarco: 1,
        foco: { x, y: x },
      });
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.x + v.ancho).toBeLessThanOrEqual(100.0001);
      expect(v.y + v.alto).toBeLessThanOrEqual(100.0001);
    }
  });

  it("misma proporción: se ve la imagen entera", () => {
    expect(
      ventanaVisible({ proporcionImagen: 1.5, proporcionMarco: 1.5 }),
    ).toEqual({ x: 0, y: 0, ancho: 100, alto: 100 });
  });

  // Antes de que la imagen cargue no se conocen sus dimensiones: dibujar un
  // rectángulo inventado sería peor que mostrar la foto entera.
  it("sin proporciones usables muestra todo en vez de inventar un recorte", () => {
    expect(
      ventanaVisible({ proporcionImagen: 0, proporcionMarco: 1 }),
    ).toEqual({ x: 0, y: 0, ancho: 100, alto: 100 });
    expect(
      ventanaVisible({ proporcionImagen: NaN, proporcionMarco: 1 }),
    ).toEqual({ x: 0, y: 0, ancho: 100, alto: 100 });
  });
});
