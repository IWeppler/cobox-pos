import { describe, expect, it } from "vitest";
import { hashRemitoProveedor } from "./hash-remito";
import type { RawOrderItem } from "../actions/create-purchase";

const linea = (over: Partial<RawOrderItem> = {}): RawOrderItem => ({
  raw_nombre: "CAMPERA INFLABLE",
  raw_variante: "TALLE: M / COLOR: NEGRO",
  cantidad: 2,
  precio_costo: 15000,
  precio_venta: 30000,
  raw_categoria: "CAMPERAS",
  raw_genero: "Mujer",
  raw_sku: null,
  raw_marca: null,
  raw_imei: null,
  ...over,
});

describe("huella del remito de proveedor", () => {
  it("el mismo contenido da la misma huella", () => {
    expect(hashRemitoProveedor([linea()])).toBe(hashRemitoProveedor([linea()]));
  });

  it("cambiar una cantidad la vuelve otro remito", () => {
    // Es cuando SÍ hay que poder subirlo: no es el mismo pedido.
    expect(hashRemitoProveedor([linea()])).not.toBe(
      hashRemitoProveedor([linea({ cantidad: 3 })]),
    );
  });

  it("cambiar un costo la vuelve otro remito", () => {
    expect(hashRemitoProveedor([linea()])).not.toBe(
      hashRemitoProveedor([linea({ precio_costo: 16000 })]),
    );
  });

  it("los espacios al borde no cambian la huella", () => {
    // La misma planilla reexportada llega con espacios distintos; sigue siendo
    // el mismo remito.
    expect(hashRemitoProveedor([linea({ raw_nombre: "  CAMPERA INFLABLE " })])).toBe(
      hashRemitoProveedor([linea()]),
    );
  });

  it("una línea de más la vuelve otro remito", () => {
    expect(hashRemitoProveedor([linea()])).not.toBe(
      hashRemitoProveedor([linea(), linea({ raw_nombre: "OTRA COSA" })]),
    );
  });

  it("el IMEI participa: dos aparatos distintos no son el mismo remito", () => {
    expect(hashRemitoProveedor([linea({ raw_imei: "111" })])).not.toBe(
      hashRemitoProveedor([linea({ raw_imei: "222" })]),
    );
  });
});
