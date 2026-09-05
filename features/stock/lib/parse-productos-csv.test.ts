import { describe, it, expect } from "vitest";
import {
  csvARows,
  parseNumeroLocal,
  parseProductosSheet,
} from "./parse-productos-csv";
import { ALIAS_COLUMNA_GENERO } from "@/shared/lib/alias-columna-genero";

describe("parseNumeroLocal", () => {
  it("parsea formato es-AR con miles y decimales", () => {
    expect(parseNumeroLocal("$ 1.234,50")).toBe(1234.5);
  });

  it("parsea formato en-US con miles y decimales", () => {
    expect(parseNumeroLocal("1,234.50")).toBe(1234.5);
  });

  it("trata un separador con 3 decimales como miles", () => {
    expect(parseNumeroLocal("1.234")).toBe(1234);
    expect(parseNumeroLocal("1,234")).toBe(1234);
  });

  it("trata un separador con 2 decimales como decimal", () => {
    expect(parseNumeroLocal("1234,50")).toBe(1234.5);
    expect(parseNumeroLocal("1234.50")).toBe(1234.5);
  });

  it("devuelve null si no hay dígitos, para distinguir vacío de cero", () => {
    expect(parseNumeroLocal("")).toBeNull();
    expect(parseNumeroLocal("  $  ")).toBeNull();
    expect(parseNumeroLocal("0")).toBe(0);
  });
});

describe("parseProductosSheet — columnas opcionales", () => {
  it("importa una planilla de indumentaria sin ninguna columna de electro", () => {
    const rows = [
      ["Categoria", "Producto", "Color", "Stock"],
      ["Remeras", "Remera Basica", "Negro", "12"],
    ];

    const res = parseProductosSheet(rows);

    expect(res.error).toBeNull();
    expect(res.filas).toHaveLength(1);
    expect(res.filas[0]).toMatchObject({
      categoria: "Remeras",
      producto: "Remera Basica",
      atributos: { Color: "Negro" },
      stock: 12,
      imei: null,
      codigoBarras: null,
      precioCosto: null,
      precioVenta: null,
    });
    expect(res.columnasDetectadas).not.toContain("imei");
  });

  it("el género se reconoce y NO entra como atributo de variante", () => {
    // En indumentaria el género es la categoría de arriba (Hombre > Camperas),
    // no un eje que parta el producto. Si entrara en `atributos`, dos filas de
    // la misma prenda para distinto público serían dos variantes en vez de dos
    // productos colgados de padres distintos.
    const rows = [
      ["Genero", "Producto", "Talle", "Color", "Stock"],
      ["Nena", "Campera puffer", "8", "Rosa", "4"],
    ];

    const res = parseProductosSheet(rows);

    expect(res.filas[0]).toMatchObject({
      genero: "Nena",
      atributos: { Talle: "8", Color: "Rosa" },
    });
    expect(res.columnasIgnoradas).toEqual([]);
  });

  it("'subcategoria' es la misma columna que 'categoria'", () => {
    // En un catálogo por audiencia lo que el comercio escribe es el hijo
    // (CAMPERAS), y llamarlo "categoría" en la plantilla lo hace dudar de si
    // ahí va el padre.
    const res = parseProductosSheet([
      ["Subcategoria", "Producto", "Stock"],
      ["CAMPERAS", "Puffer larga", "2"],
    ]);
    expect(res.filas[0].categoria).toBe("CAMPERAS");
    expect(res.columnasIgnoradas).toEqual([]);
  });

  // Se itera la lista COMPARTIDA, no una copia: es la misma que usa el
  // importador de remitos (`create-purchase-modal.tsx`), y cuando eran dos
  // listas distintas una columna "SEXO" entraba por el remito como atributo
  // libre y le pegaba "SEXO: Mujer" a cada variante. Si alguien agrega un
  // alias que el parser no reconoce, este test lo dice.
  it("acepta todas las formas de la columna de género que declara shared", () => {
    for (const header of ALIAS_COLUMNA_GENERO) {
      const res = parseProductosSheet([
        [header, "Producto", "Stock"],
        ["Hombre", "Camisa", "2"],
      ]);
      expect(res.filas[0].genero).toBe("Hombre");
    }
  });

  it("importa una planilla de electro con todas las columnas", () => {
    const rows = [
      [
        "categoría",
        "codigo_barras",
        "producto",
        "color",
        "memoria",
        "stock",
        "imei",
        "precio_costo",
        "precio venta",
      ],
      [
        "Celulares",
        "7791234567890",
        "Samsung A15",
        "Negro",
        "128GB",
        "1",
        "356938035643809",
        "$ 250.000",
        "$ 380.000,50",
      ],
    ];

    const res = parseProductosSheet(rows);

    expect(res.error).toBeNull();
    expect(res.filas[0]).toMatchObject({
      categoria: "Celulares",
      codigoBarras: "7791234567890",
      producto: "Samsung A15",
      atributos: { Color: "Negro", Memoria: "128GB" },
      imei: "356938035643809",
      precioCosto: 250000,
      precioVenta: 380000.5,
    });
  });

  it("exige solo la columna producto", () => {
    const res = parseProductosSheet([["Producto"], ["Remera"]]);
    expect(res.error).toBeNull();
    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].stock).toBe(1);
  });

  it("falla si no hay columna producto", () => {
    const res = parseProductosSheet([["Categoria", "Stock"], ["Remeras", "3"]]);
    expect(res.error).toContain("producto");
    expect(res.filas).toHaveLength(0);
  });
});

describe("parseProductosSheet — IMEI fuerza stock 1", () => {
  it("ignora la columna stock cuando la fila trae IMEI", () => {
    const rows = [
      ["Producto", "Stock", "IMEI"],
      ["Samsung A15", "5", "356938035643809"],
    ];

    const res = parseProductosSheet(rows);

    expect(res.filas[0].stock).toBe(1);
    expect(res.filas[0].imei).toBe("356938035643809");
  });

  it("respeta el stock cuando no hay IMEI", () => {
    const rows = [
      ["Producto", "Stock", "IMEI"],
      ["Cargador USB-C", "40", ""],
    ];

    expect(parseProductosSheet(rows).filas[0].stock).toBe(40);
  });
});

describe("parseProductosSheet — tolerancia de formato", () => {
  it("encuentra el header aunque haya títulos arriba", () => {
    const rows = [
      ["LISTA DE PRECIOS JULIO"],
      [],
      ["Producto", "Stock"],
      ["Remera", "3"],
    ];

    const res = parseProductosSheet(rows);
    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].fila).toBe(4);
  });

  it("matchea headers con tildes, mayúsculas y guiones bajos", () => {
    const rows = [
      ["CATEGORÍA", "Producto", "PRECIO_VENTA"],
      ["Celulares", "Moto G54", "300000"],
    ];

    const res = parseProductosSheet(rows);
    expect(res.filas[0].categoria).toBe("Celulares");
    expect(res.filas[0].precioVenta).toBe(300000);
  });

  it("reporta filas sin nombre de producto en vez de descartarlas en silencio", () => {
    const rows = [
      ["Producto", "Stock"],
      ["", "5"],
      ["Remera", "2"],
    ];

    const res = parseProductosSheet(rows);
    expect(res.filas).toHaveLength(1);
    expect(res.invalidas).toEqual([
      { fila: 2, motivo: "Fila sin nombre de producto." },
    ]);
  });

  it("lista las columnas que no reconoce", () => {
    const rows = [
      ["Producto", "Proveedor", "Stock"],
      ["Remera", "Acme SA", "2"],
    ];

    expect(parseProductosSheet(rows).columnasIgnoradas).toEqual(["Proveedor"]);
  });
});

describe("csvARows", () => {
  it("respeta comas dentro de campos entrecomillados", () => {
    const texto = 'Producto,Stock\n"Smart TV 50"", 4K",3';
    const rows = csvARows(texto);
    expect(rows[1]).toEqual(['Smart TV 50", 4K', "3"]);
  });

  it("detecta punto y coma como separador", () => {
    const rows = csvARows("Producto;Stock\nRemera;3");
    expect(rows[1]).toEqual(["Remera", "3"]);
  });

  it("detecta tab como separador", () => {
    const rows = csvARows("Producto\tStock\nRemera\t3");
    expect(rows[1]).toEqual(["Remera", "3"]);
  });

  it("saca el BOM de los exports de Excel", () => {
    const rows = csvARows("﻿Producto,Stock\nRemera,3");
    expect(rows[0][0]).toBe("Producto");
  });
});
