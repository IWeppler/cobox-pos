import { describe, expect, it } from "vitest";
import {
  leerClaimComerz,
  resolverContextoDesdeClaim,
  VERSION_CLAIM_COMERZ,
  type ClaimComerz,
} from "./contexto-desde-claims";

/**
 * Estos tests son el contrato con `security.current_negocio_id()` y
 * `public.rol_actual()`. Cada caso de acá corresponde a una rama de esas
 * funciones: si alguien cambia una, este archivo tiene que cambiar con ella o
 * el middleware y la RLS empiezan a decir cosas distintas.
 */

const EVENS = "44468525-8381-4c83-a558-eb7209e386b5";
const CLICK = "1844badf-1a9a-457c-bfee-4d10122337e8";
const AJENO = "9d9faad5-6545-48b1-b81b-a6ebf39894ea";

function claim(parcial: Partial<ClaimComerz> = {}): ClaimComerz {
  return {
    v: VERSION_CLAIM_COMERZ,
    negocios: { [EVENS]: "VENDEDOR" },
    negocio_unico: EVENS,
    super_admin: false,
    ...parcial,
  };
}

describe("leerClaimComerz", () => {
  it("cae a null si el token no trae el claim (sesión anterior al hook)", () => {
    expect(leerClaimComerz({ sub: "x", role: "authenticated" })).toBeNull();
  });

  it("cae a null si la versión no es la que este código entiende", () => {
    expect(leerClaimComerz({ comerz: { ...claim(), v: 99 } })).toBeNull();
  });

  it("cae a null si el mapa no está o no es objeto", () => {
    expect(leerClaimComerz({ comerz: { v: 1, super_admin: false } })).toBeNull();
    expect(
      leerClaimComerz({ comerz: { v: 1, negocios: "no soy objeto" } }),
    ).toBeNull();
  });

  it("tolera claims vacíos o basura sin romper", () => {
    expect(leerClaimComerz(null)).toBeNull();
    expect(leerClaimComerz(undefined)).toBeNull();
    expect(leerClaimComerz("string")).toBeNull();
    expect(leerClaimComerz({})).toBeNull();
  });

  it("lee un claim válido", () => {
    const leido = leerClaimComerz({ comerz: claim() });
    expect(leido?.negocios[EVENS]).toBe("VENDEDOR");
    expect(leido?.negocio_unico).toBe(EVENS);
  });

  it("un mapa vacío es válido: el usuario existe y todavía no tiene negocio", () => {
    const leido = leerClaimComerz({
      comerz: claim({ negocios: {}, negocio_unico: null }),
    });
    expect(leido).not.toBeNull();
    expect(leido?.negocios).toEqual({});
  });
});

describe("resolverContextoDesdeClaim", () => {
  it("una sola membresía y sin cookie: ese es el negocio activo", () => {
    expect(resolverContextoDesdeClaim(claim(), {})).toEqual({
      rol: "VENDEDOR",
      negocioId: EVENS,
      esSuperAdmin: false,
    });
  });

  it("la cookie elige entre las membresías", () => {
    const dos = claim({
      negocios: { [EVENS]: "ADMIN", [CLICK]: "VENDEDOR" },
      negocio_unico: null,
    });
    expect(resolverContextoDesdeClaim(dos, { negocioActivo: CLICK })).toEqual({
      rol: "VENDEDOR",
      negocioId: CLICK,
      esSuperAdmin: false,
    });
  });

  it("con dos membresías y sin cookie NO elige una: hay que ir a elegir", () => {
    const dos = claim({
      negocios: { [EVENS]: "ADMIN", [CLICK]: "VENDEDOR" },
      negocio_unico: null,
    });
    expect(resolverContextoDesdeClaim(dos, {})).toEqual({
      rol: null,
      negocioId: null,
      esSuperAdmin: false,
    });
  });

  it("cookie de un negocio AJENO: deja sin negocio activo, no cae al propio", () => {
    // Es la rama más fácil de equivocar. `current_negocio_id()` busca la
    // cookie en usuarios_negocios y devuelve lo que encuentra —null— sin
    // seguir al atajo de "una sola membresía".
    expect(
      resolverContextoDesdeClaim(claim(), { negocioActivo: AJENO }),
    ).toEqual({ rol: null, negocioId: null, esSuperAdmin: false });
  });

  it("sin membresías y sin cookie: sin negocio activo", () => {
    expect(
      resolverContextoDesdeClaim(
        claim({ negocios: {}, negocio_unico: null }),
        {},
      ),
    ).toEqual({ rol: null, negocioId: null, esSuperAdmin: false });
  });

  describe("super admin", () => {
    const superAdmin = claim({
      negocios: {},
      negocio_unico: null,
      super_admin: true,
    });

    it("impersonando: toma el negocio pedido SIN validarlo contra el mapa", () => {
      // Su mapa viene vacío (no tiene membresías), así que validar lo dejaría
      // sin poder impersonar — que es para lo único que existe la rama.
      expect(
        resolverContextoDesdeClaim(superAdmin, { impersonando: AJENO }),
      ).toEqual({ rol: "ADMIN", negocioId: AJENO, esSuperAdmin: true });
    });

    it("sin impersonar: no tiene negocio activo, pero sigue siendo super admin", () => {
      expect(resolverContextoDesdeClaim(superAdmin, {})).toEqual({
        rol: null,
        negocioId: null,
        esSuperAdmin: true,
      });
    });

    it("la impersonación gana sobre la cookie de negocio activo", () => {
      expect(
        resolverContextoDesdeClaim(superAdmin, {
          impersonando: AJENO,
          negocioActivo: EVENS,
        }),
      ).toEqual({ rol: "ADMIN", negocioId: AJENO, esSuperAdmin: true });
    });

    it("si además fuera miembro, su rol sigue siendo ADMIN", () => {
      const conMembresia = claim({
        negocios: { [EVENS]: "VENDEDOR" },
        negocio_unico: EVENS,
        super_admin: true,
      });
      expect(
        resolverContextoDesdeClaim(conMembresia, { negocioActivo: EVENS }),
      ).toEqual({ rol: "ADMIN", negocioId: EVENS, esSuperAdmin: true });
    });

    it("NO impersonando pero con cookie ajena: sin negocio, como cualquiera", () => {
      expect(
        resolverContextoDesdeClaim(superAdmin, { negocioActivo: AJENO }),
      ).toEqual({ rol: null, negocioId: null, esSuperAdmin: true });
    });
  });
});
