import { describe, expect, it } from "vitest";
import { parseRemitoProveedor, type CeldaExcel } from "./parse-remito-proveedor";

/**
 * Los diez casos son las diez formas de planilla con las que se probó el
 * parser viejo el 8/9/2026. Seis fallaban en silencio; están acá para que no
 * vuelvan a fallar sin que nadie se entere.
 */

const filas = (r: CeldaExcel[][]) => r;

describe("planillas que antes rompían", () => {
  it("A. el membrete de arriba ya no se confunde con el encabezado", () => {
    const res = parseRemitoProveedor(
      filas([
        ["DISTRIBUIDORA LA PLATA", "REMITO N° 0001-00045", "FECHA 08/09/2026"],
        [],
        ["PRODUCTO", "TALLE", "COLOR", "CANTIDAD", "PRECIO"],
        ["Buzo frisado", "M", "Negro", "3", "12500"],
      ]),
    );

    expect(res.error).toBeNull();
    expect(res.filaEncabezado).toBe(3);
    expect(res.filas).toHaveLength(1);
    expect(res.filas[0]).toMatchObject({
      raw_nombre: "Buzo frisado",
      cantidad: 3,
      precio_costo: 12500,
      raw_variante: "TALLE: M / COLOR: Negro",
    });
  });

  it("B. con dos columnas PRECIO gana la primera y se avisa", () => {
    // Antes la segunda pisaba a la primera: el costo entraba con el precio de
    // venta, en silencio, y ese número queda congelado en el margen.
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO", "PRECIO"],
        ["Vaso plástico x10", "20", "1200", "2500"],
      ]),
    );

    expect(res.filas[0].precio_costo).toBe(1200);
    expect(res.avisos.map((a) => a.tipo)).toContain("columna-duplicada");
  });

  it("C. la fila de totales no entra como producto", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO"],
        ["Globo látex", "100", "80"],
        ["TOTAL", "100", "8000"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].raw_nombre).toBe("Globo látex");
    expect(res.avisos.some((a) => a.detalle.includes("total del remito"))).toBe(true);
  });

  it("E. la columna de nombre puede llamarse distinto", () => {
    const res = parseRemitoProveedor(
      filas([
        ["ITEM", "DETALLE DEL PRODUCTO", "CANT", "P UNITARIO"],
        ["1", "Vela número 5", "10", "800"],
      ]),
    );

    expect(res.error).toBeNull();
    expect(res.filas[0]).toMatchObject({ raw_nombre: "Vela número 5", cantidad: 10, precio_costo: 800 });
  });

  it("F. la cantidad negativa se descarta con motivo, no se vuelve 0", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO"],
        ["Globo metalizado", "-3", "900"],
      ]),
    );

    expect(res.filas).toHaveLength(0);
    expect(res.avisos.some((a) => a.detalle.includes("negativa"))).toBe(true);
  });

  it("una columna de IMPORTE no se toma como precio unitario", () => {
    // Es el total del renglón: usarlo como costo multiplicaría el costo por la
    // cantidad y contaminaría el margen de todo lo que se venda después.
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO UNITARIO", "IMPORTE"],
        ["Piñata", "2", "4500", "9000"],
      ]),
    );

    expect(res.filas[0].precio_costo).toBe(4500);
    expect(res.avisos.some((a) => a.tipo === "columna-total")).toBe(true);
  });

  it("sin columna de producto avisa qué columnas encontró", () => {
    const res = parseRemitoProveedor(
      filas([
        ["COD", "REFERENCIA INTERNA", "CANT"],
        ["A-1", "xx", "3"],
      ]),
    );

    expect(res.filas).toHaveLength(0);
    expect(res.error).toContain("REFERENCIA INTERNA");
  });
});

describe("matriz de talles (una columna por talle)", () => {
  it("D. abre la fila en un renglón por talle, con su cantidad", () => {
    // Antes esto entraba como UN producto con cantidad 0 y los talles como
    // atributos absurdos ("S: 2 / M: 5"): once prendas como ninguna.
    const res = parseRemitoProveedor(
      filas([
        ["ARTICULO", "COLOR", "S", "M", "L", "XL", "PRECIO"],
        ["Remera lisa", "Negro", "2", "5", "3", "1", "6000"],
      ]),
    );

    expect(res.filas).toHaveLength(4);
    expect(res.filas.map((f) => [f.raw_variante, f.cantidad])).toEqual([
      ["TALLE: S / COLOR: Negro", 2],
      ["TALLE: M / COLOR: Negro", 5],
      ["TALLE: L / COLOR: Negro", 3],
      ["TALLE: XL / COLOR: Negro", 1],
    ]);
    // El costo es del artículo, no del talle: viaja igual a los cuatro.
    expect(res.filas.every((f) => f.precio_costo === 6000)).toBe(true);
    expect(res.avisos.some((a) => a.detalle.includes("una columna por talle"))).toBe(true);
  });

  it("el talle que el proveedor no mandó no genera renglón", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "38", "40", "42", "PRECIO"],
        ["Jean recto", "3", "", "0", "14000"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0]).toMatchObject({ raw_variante: "TALLE: 38", cantidad: 3 });
  });

  it("una fila sin cantidad en ningún talle se descarta avisando", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "S", "M", "PRECIO"],
        ["Buzo", "2", "1", "9000"],
        ["Campera", "", "", "20000"],
      ]),
    );

    expect(res.filas).toHaveLength(2);
    expect(res.avisos.some((a) => a.detalle.includes("sin cantidad en ningún talle"))).toBe(true);
  });

  it("si además hay columna CANTIDAD, no se usa (sería el total del renglón)", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "S", "M", "PRECIO"],
        ["Remera", "7", "3", "4", "6000"],
      ]),
    );

    expect(res.filas.map((f) => f.cantidad)).toEqual([3, 4]);
    expect(res.avisos.some((a) => a.detalle.includes("no se usa"))).toBe(true);
  });

  // ─── Falsos positivos: lo que NO tiene que tomar como matriz ───────────────

  it("una sola columna de talle no es una matriz", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "TALLE", "CANTIDAD", "PRECIO"],
        ["Remera", "M", "5", "6000"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0]).toMatchObject({ raw_variante: "TALLE: M", cantidad: 5 });
  });

  it("columnas de talle con TEXTO adentro no son cantidades", () => {
    // "S" y "M" acá son iniciales de otra cosa: si la celda no es número, no
    // es una matriz de cantidades.
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "S", "M", "CANTIDAD", "PRECIO"],
        ["Cinta", "sí", "no", "4", "300"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].cantidad).toBe(4);
    expect(res.filas[0].raw_variante).toContain("S: sí");
  });

  it("no se mezclan vocabularios: 'L' con '40' no es una matriz", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "L", "40", "CANTIDAD", "PRECIO"],
        ["Aceite", "2", "3", "6", "1800"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].cantidad).toBe(6);
  });

  it("un bloque de talles todo en blanco no es una matriz", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "S", "M", "CANTIDAD", "PRECIO"],
        ["Gorro", "", "", "9", "1500"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].cantidad).toBe(9);
  });
});

describe("lo que ya andaba bien sigue andando", () => {
  it("números con símbolo, miles y decimales", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO", "PRECIO VENTA"],
        ["Piñata", "2", "$ 4.500,50", "9.900"],
        ["Confites", "1,5", "6.500", "11900.75"],
      ]),
    );

    expect(res.filas[0]).toMatchObject({ cantidad: 2, precio_costo: 4500.5, precio_venta: 9900 });
    expect(res.filas[1]).toMatchObject({ cantidad: 1.5, precio_costo: 6500, precio_venta: 11900.75 });
  });

  it("cantidad con la unidad pegada", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO"],
        ["Platos", "12 u", "500"],
        ["Vasos", "x6", "300"],
      ]),
    );

    expect(res.filas.map((f) => f.cantidad)).toEqual([12, 6]);
  });

  it("columnas vacías entre medio (celdas combinadas)", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "", "CANTIDAD", "", "PRECIO"],
        ["Servilletas", "", "10", "", "900"],
      ]),
    );

    expect(res.filas[0]).toMatchObject({ raw_nombre: "Servilletas", cantidad: 10, precio_costo: 900 });
  });

  it("encabezado en dos filas: gana la que tiene el nombre", () => {
    const res = parseRemitoProveedor(
      filas([
        ["", "DATOS DEL ARTICULO", "", "VALORES", ""],
        ["CODIGO", "DESCRIPCION", "CANT", "COSTO", "VENTA"],
        ["A-1", "Guirnalda", "5", "1200", "2500"],
      ]),
    );

    expect(res.filaEncabezado).toBe(2);
    expect(res.filas[0]).toMatchObject({
      raw_nombre: "Guirnalda",
      raw_sku: "A-1",
      cantidad: 5,
      precio_costo: 1200,
      precio_venta: 2500,
    });
  });

  it("IMEI y código de barras van a su campo, no a la variante", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CODIGO DE BARRAS", "COLOR", "MEMORIA", "IMEI", "CANTIDAD", "COSTO"],
        ["Samsung A16", "8806095829067", "Blanco", "4/128GB", "350558669503537", "1", "255000"],
      ]),
    );

    expect(res.filas[0]).toMatchObject({
      raw_sku: "8806095829067",
      raw_imei: "350558669503537",
      raw_variante: "COLOR: Blanco / MEMORIA: 4/128GB",
    });
  });

  it("el encabezado repetido en el medio del archivo se saltea sin ruido", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO"],
        ["Vela", "5", "800"],
        ["PRODUCTO", "CANTIDAD", "PRECIO"],
        ["Gorro", "3", "600"],
      ]),
    );

    expect(res.filas.map((f) => f.raw_nombre)).toEqual(["Vela", "Gorro"]);
    expect(res.avisos.filter((a) => a.tipo === "fila-descartada")).toHaveLength(0);
  });

  it("una fila sin cantidad entra, pero avisada", () => {
    const res = parseRemitoProveedor(
      filas([
        ["PRODUCTO", "CANTIDAD", "PRECIO"],
        ["Cinta de regalo", "", "300"],
      ]),
    );

    expect(res.filas).toHaveLength(1);
    expect(res.filas[0].cantidad).toBe(0);
    expect(res.avisos.some((a) => a.detalle.includes("sin cantidad"))).toBe(true);
  });

  it("el archivo vacío no explota", () => {
    expect(parseRemitoProveedor([]).error).toBe("El archivo está vacío.");
  });
});
