import { describe, it, expect } from "vitest";
import {
  nombreArchivoPlantilla,
  plantillaImportProductos,
} from "./plantilla-import-productos";
import { parseProductosSheet } from "./parse-productos-csv";

/** Split naíf, alcanza porque la plantilla no tiene celdas con coma. */
function comoMatriz(csv: string): string[][] {
  return csv.split("\r\n").map((linea) => linea.split(","));
}

describe("plantillaImportProductos", () => {
  it("la plantilla de electro la parsea el mismo parser, sin columnas ignoradas", () => {
    const res = parseProductosSheet(comoMatriz(plantillaImportProductos("electro")));

    expect(res.error).toBeNull();
    expect(res.columnasIgnoradas).toEqual([]);
    expect(res.invalidas).toEqual([]);
    expect(res.filas).toHaveLength(3);
  });

  it("la plantilla de indumentaria también", () => {
    const res = parseProductosSheet(
      comoMatriz(plantillaImportProductos("indumentaria")),
    );

    expect(res.error).toBeNull();
    expect(res.columnasIgnoradas).toEqual([]);
    expect(res.filas).toHaveLength(3);
  });

  it("electro muestra dos aparatos iguales con IMEI distinto, una unidad cada uno", () => {
    const { filas } = parseProductosSheet(
      comoMatriz(plantillaImportProductos("electro")),
    );
    const conImei = filas.filter((f) => f.imei);

    expect(conImei).toHaveLength(2);
    expect(conImei[0].producto).toBe(conImei[1].producto);
    expect(conImei[0].imei).not.toBe(conImei[1].imei);
    expect(conImei.every((f) => f.stock === 1)).toBe(true);
  });

  it("indumentaria no trae IMEI ni memoria: no aplican al rubro", () => {
    const { filas } = parseProductosSheet(
      comoMatriz(plantillaImportProductos("indumentaria")),
    );

    expect(filas.every((f) => f.imei === null)).toBe(true);
    expect(filas.every((f) => !("Memoria" in f.atributos))).toBe(true);
    expect(filas.every((f) => Boolean(f.atributos.Color))).toBe(true);
  });

  it("los ejemplos traen precio de venta: sin él una fila nueva se bloquea", () => {
    for (const rubro of ["electro", "indumentaria"] as const) {
      const { filas } = parseProductosSheet(
        comoMatriz(plantillaImportProductos(rubro)),
      );
      expect(filas.every((f) => (f.precioVenta ?? 0) > 0)).toBe(true);
    }
  });

  it("el nombre del archivo dice el rubro", () => {
    expect(nombreArchivoPlantilla("electro")).toBe(
      "plantilla-productos-electro.csv",
    );
    expect(nombreArchivoPlantilla("indumentaria")).toBe(
      "plantilla-productos-indumentaria.csv",
    );
  });
});
