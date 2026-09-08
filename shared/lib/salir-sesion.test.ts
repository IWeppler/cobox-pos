import { describe, expect, it } from "vitest";
import {
  DESTINO_LOGIN_SESION_VENCIDA,
  RUTA_SALIR,
  esSalidaDeSesion,
} from "./salir-sesion";

/**
 * Estas dos aserciones son el freno del loop del 7/9/2026: si
 * `esSalidaDeSesion` devuelve false para la salida, el gate 5 del middleware
 * rebota al panel a quien viene con un token que el servidor de Auth ya no
 * reconoce, y el ciclo empieza de nuevo.
 */
describe("salida de una sesión que el servidor ya no reconoce", () => {
  it("reconoce el route handler que borra las cookies", () => {
    expect(esSalidaDeSesion(RUTA_SALIR, "")).toBe(true);
  });

  it("reconoce el login al que aterriza esa salida", () => {
    const [pathname, search] = DESTINO_LOGIN_SESION_VENCIDA.split("?");
    expect(esSalidaDeSesion(pathname, `?${search}`)).toBe(true);
  });

  it("no confunde el login normal ni el resto de /auth", () => {
    expect(esSalidaDeSesion("/auth", "")).toBe(false);
    expect(esSalidaDeSesion("/auth", "?error=sin-negocio")).toBe(false);
    expect(esSalidaDeSesion("/auth/actualizar-password", "")).toBe(false);
    expect(esSalidaDeSesion("/", "")).toBe(false);
  });

  // `/auth/salir` empieza con `/auth`, o sea que el middleware lo trata como
  // ruta de login y NO exige sesión: si no, cerrar una sesión rota exigiría
  // tener una sesión sana.
  it("la salida vive bajo /auth para no exigir sesión", () => {
    expect(RUTA_SALIR.startsWith("/auth")).toBe(true);
  });
});
