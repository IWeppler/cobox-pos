import { describe, expect, it } from "vitest";
import {
  calcularProgresoActivacion,
  construirPasosActivacion,
  type EstadoActivacion,
} from "./pasos-activacion";

const RECIEN_CREADO: EstadoActivacion = {
  rubro: "indumentaria",
  // El alta siembra Efectivo, así que este nace en true.
  metodos_pago: true,
  marca: false,
  productos: false,
  stock_y_precios: false,
  empleados: false,
  catalogo_publicado: false,
  caja: false,
  primera_venta: false,
};

const TODO_HECHO: EstadoActivacion = {
  rubro: "indumentaria",
  marca: true,
  metodos_pago: true,
  productos: true,
  stock_y_precios: true,
  empleados: true,
  catalogo_publicado: true,
  caja: true,
  primera_venta: true,
};

describe("construirPasosActivacion", () => {
  it("manda a la carga rápida en electro y a stock en indumentaria", () => {
    const electro = construirPasosActivacion({ ...RECIEN_CREADO, rubro: "electro" });
    const ropa = construirPasosActivacion(RECIEN_CREADO);

    expect(electro.find((p) => p.clave === "productos")?.href).toBe(
      "/stock/carga-rapida",
    );
    expect(ropa.find((p) => p.clave === "productos")?.href).toBe("/stock");
  });

  it("un rubro desconocido cae en el flujo de indumentaria (fail-closed)", () => {
    const pasos = construirPasosActivacion({ ...RECIEN_CREADO, rubro: "vaya-a-saber" });
    expect(pasos.find((p) => p.clave === "productos")?.href).toBe("/stock");
  });

  it("ofrece planilla Y remito en TODOS los rubros", () => {
    // El ingreso de mercadería dejó de elegirse por rubro: una tienda de ropa
    // también puede tener una planilla propia, y una de electro también
    // recibe remitos. Lo que cambia por rubro son las columnas de la
    // plantilla, no el camino.
    for (const rubro of ["electro", "indumentaria", "ferreteria"] as const) {
      const titulos = construirPasosActivacion({ ...RECIEN_CREADO, rubro })
        .find((p) => p.clave === "productos")!
        .opciones!.map((o) => o.titulo);

      expect(titulos, rubro).toContain("Con una planilla tuya");
      expect(titulos, rubro).toContain("Con el remito de tu proveedor");
      expect(titulos, rubro).toContain("De a uno, a mano");
    }
  });

  it("el escaneo de código de barras no se le ofrece a indumentaria", () => {
    // Es el único camino que sí depende del rubro: la ropa de proveedor local
    // casi nunca trae EAN, y ofrecerlo manda a una pantalla que no va a
    // servir. Misma razón por la que su plantilla tampoco lleva la columna.
    const escaneo = "Escaneando el código de barras";

    const ropa = construirPasosActivacion(RECIEN_CREADO)
      .find((p) => p.clave === "productos")!
      .opciones!.map((o) => o.titulo);
    const electro = construirPasosActivacion({ ...RECIEN_CREADO, rubro: "electro" })
      .find((p) => p.clave === "productos")!
      .opciones!.map((o) => o.titulo);

    expect(ropa).not.toContain(escaneo);
    expect(electro).toContain(escaneo);
  });

  it("abrir caja dispara el modal, no navega", () => {
    // /caja es el historial y los arqueos; el turno se abre desde el chip del
    // navbar. Mandar ahí era prometer un botón que esa pantalla no tiene.
    const caja = construirPasosActivacion(RECIEN_CREADO).find(
      (p) => p.clave === "caja",
    );
    expect(caja?.accion).toBe("abrir-caja");
    // La primera opción es la que resuelve el paso: el chip, que no es una
    // pantalla y por eso no lleva href.
    expect(caja?.opciones?.[0].href).toBeUndefined();
  });

  it("empleados y catálogo son los únicos opcionales", () => {
    const opcionales = construirPasosActivacion(RECIEN_CREADO)
      .filter((p) => p.opcional)
      .map((p) => p.clave);
    expect(opcionales).toEqual(["empleados", "catalogo_publicado"]);
  });
});

describe("calcularProgresoActivacion", () => {
  it("no cuenta los opcionales en el progreso", () => {
    const { total, completados } = calcularProgresoActivacion(RECIEN_CREADO);
    expect(total).toBe(6);
    expect(completados).toBe(1); // solo métodos de pago
  });

  it("activa el negocio aunque los opcionales queden sin hacer", () => {
    const soloObligatorios = calcularProgresoActivacion({
      ...TODO_HECHO,
      empleados: false,
      catalogo_publicado: false,
    });
    expect(soloObligatorios.activado).toBe(true);
    // El siguiente sí puede ser un opcional: la card ya no se muestra, pero la
    // regla es "el primero que falta", sin filtrar.
    expect(soloObligatorios.siguiente?.clave).toBe("empleados");
  });

  it("un paso obligatorio que se deshace vuelve a desactivar", () => {
    // El caso que justifica el estado derivado: borró todos los productos.
    const { activado, siguiente } = calcularProgresoActivacion({
      ...TODO_HECHO,
      primera_venta: false,
      productos: false,
      stock_y_precios: false,
    });
    expect(activado).toBe(false);
    expect(siguiente?.clave).toBe("productos");
  });

  it("una venta hecha activa el negocio aunque un paso dé en falso", () => {
    // Red para los comercios que ya trabajan: si la detección de un paso se
    // equivoca, el que factura hace un año no tiene que ver "primeros pasos".
    const progreso = calcularProgresoActivacion({
      ...RECIEN_CREADO,
      primera_venta: true,
    });
    expect(progreso.activado).toBe(true);
  });

  it("con todo hecho no queda paso siguiente", () => {
    const progreso = calcularProgresoActivacion(TODO_HECHO);
    expect(progreso.activado).toBe(true);
    expect(progreso.siguiente).toBeNull();
    expect(progreso.completados).toBe(progreso.total);
  });
});
