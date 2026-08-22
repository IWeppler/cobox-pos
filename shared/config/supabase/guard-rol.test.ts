import { describe, expect, it } from "vitest";
import { esVendedorBloqueado } from "./guard-rol";

/**
 * Estos casos son el ESPEJO del bloqueo por rol del middleware. Si alguno
 * cambia, los dos lados dejaron de decir lo mismo y una ruta de gestión pasa a
 * autorizar distinto según por dónde se llegue.
 */
describe("esVendedorBloqueado", () => {
  it("bloquea a VENDEDOR", () => {
    expect(esVendedorBloqueado({ rol: "VENDEDOR", esSuperAdmin: false })).toBe(
      true,
    );
  });

  it("deja pasar a ADMIN", () => {
    expect(esVendedorBloqueado({ rol: "ADMIN", esSuperAdmin: false })).toBe(
      false,
    );
  });

  it("deja pasar a ENCARGADO", () => {
    // El middleware bloquea SOLO a VENDEDOR. Un guard con `is_admin()` habría
    // dejado afuera al encargado, que hoy entra: sería una regresión.
    expect(esVendedorBloqueado({ rol: "ENCARGADO", esSuperAdmin: false })).toBe(
      false,
    );
  });

  it("rol nulo cuenta como VENDEDOR", () => {
    // Mismo criterio que el middleware (`rolActual || "VENDEDOR"`): ante la
    // duda, el rol más restrictivo.
    expect(esVendedorBloqueado({ rol: null, esSuperAdmin: false })).toBe(true);
  });

  it("el super admin pasa aunque no tenga rol en el negocio", () => {
    // El middleware retorna antes de llegar al bloqueo por rol, así que hoy
    // entra. Sin esta salida, un super admin sin negocio activo —donde
    // `rol_actual()` es null— terminaría rebotado a /pos.
    expect(esVendedorBloqueado({ rol: null, esSuperAdmin: true })).toBe(false);
  });

  it("el super admin pasa aunque su rol figure como VENDEDOR", () => {
    expect(esVendedorBloqueado({ rol: "VENDEDOR", esSuperAdmin: true })).toBe(
      false,
    );
  });
});
