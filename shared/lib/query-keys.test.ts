import { describe, expect, it } from "vitest";
import { conNegocio, esQueryPersistible, queryKeys } from "./query-keys";

describe("esQueryPersistible", () => {
  it("guarda el catálogo del POS y el de Inventario", () => {
    expect(esQueryPersistible(queryKeys.pos.productos)).toBe(true);
    expect(esQueryPersistible(queryKeys.stock.index)).toBe(true);
  });

  it("sigue guardándolos con el negocio pegado al final", () => {
    // `conNegocio` agrega el id al final, así que el match tiene que ser por
    // PREFIJO o el cache offline no guardaría nada en la app real.
    expect(
      esQueryPersistible(conNegocio(queryKeys.pos.productos, "negocio-1")),
    ).toBe(true);
  });

  it("NO guarda nada que sea plata", () => {
    // El listado de clientes trae los saldos de cuenta corriente: una foto
    // vieja de un saldo no es un dato incompleto, es uno equivocado.
    expect(esQueryPersistible(queryKeys.clientes.listado)).toBe(false);
    expect(esQueryPersistible(["caja", "turno"])).toBe(false);
  });

  it("NO guarda el detalle de un producto", () => {
    expect(esQueryPersistible(queryKeys.stock.detalle("producto-1"))).toBe(false);
  });

  it("no confunde una clave más corta con el prefijo", () => {
    expect(esQueryPersistible(["stock"])).toBe(false);
    expect(esQueryPersistible([])).toBe(false);
  });
});
