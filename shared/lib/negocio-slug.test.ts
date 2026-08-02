import { describe, expect, it } from "vitest";
import { slugDesdeHost } from "./negocio-slug";

describe("slugDesdeHost", () => {
  it("saca el slug del subdominio", () => {
    expect(slugDesdeHost("evens.cobox.app")).toBe("evens");
    expect(slugDesdeHost("estilo-bonito.cobox.app")).toBe("estilo-bonito");
  });

  it("ignora el puerto y las mayúsculas", () => {
    expect(slugDesdeHost("Evens.cobox.app:3000")).toBe("evens");
  });

  it("devuelve null en el sitio principal y en desarrollo", () => {
    expect(slugDesdeHost("cobox.app")).toBeNull();
    expect(slugDesdeHost("www.cobox.app")).toBeNull();
    expect(slugDesdeHost("localhost:3000")).toBeNull();
    expect(slugDesdeHost(null)).toBeNull();
  });

  it("no confunde un deploy de preview con un negocio", () => {
    expect(slugDesdeHost("cobox-pos-git-main-kalorashima.vercel.app")).toBeNull();
  });
});
