import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const reportar = vi.fn();
vi.mock("./reportar-error-cliente", () => ({
  reportarErrorCliente: (evento: unknown) => reportar(evento),
}));

const {
  medirFormData,
  controlarPayloadDeAction,
  UMBRAL_AVISO_PAYLOAD,
  TOPE_BODY_PLATAFORMA,
} = await import("./tamano-payload");

const archivoDe = (bytes: number, nombre: string) =>
  new File([new Uint8Array(bytes)], nombre, { type: "image/jpeg" });

beforeEach(() => reportar.mockClear());
afterEach(() => vi.restoreAllMocks());

describe("medirFormData", () => {
  it("suma los archivos por su tamaño y los textos por sus bytes", () => {
    const fd = new FormData();
    fd.append("nombre", "blusa brodery");
    fd.append("imagenes", archivoDe(1000, "a.jpg"));

    const { bytes, porCampo } = medirFormData(fd);

    expect(bytes).toBe(1000 + "blusa brodery".length);
    expect(porCampo[0]).toEqual({ campo: "imagenes", bytes: 1000 });
  });

  it("acumula los valores repetidos de un mismo campo", () => {
    // Es el caso real: un <input multiple> manda N veces la misma clave, y
    // mirarlas por separado esconde que juntas son lo que rompe el POST.
    const fd = new FormData();
    fd.append("imagenes", archivoDe(1500, "a.jpg"));
    fd.append("imagenes", archivoDe(2500, "b.jpg"));

    expect(medirFormData(fd).porCampo).toEqual([
      { campo: "imagenes", bytes: 4000 },
    ]);
  });

  it("ordena los campos de mayor a menor: el primero es el culpable", () => {
    const fd = new FormData();
    fd.append("descripcion", "x".repeat(500));
    fd.append("imagenes", archivoDe(9000, "a.jpg"));
    fd.append("precio", "1000");

    expect(medirFormData(fd).porCampo.map((c) => c.campo)).toEqual([
      "imagenes",
      "descripcion",
      "precio",
    ]);
  });

  it("un formulario vacío mide cero y no rompe", () => {
    expect(medirFormData(new FormData())).toEqual({ bytes: 0, porCampo: [] });
  });
});

describe("controlarPayloadDeAction", () => {
  it("no reporta un POST chico, que es el caso normal", () => {
    const fd = new FormData();
    fd.append("nombre", "blusa brodery");
    fd.append("precio", "18000");

    controlarPayloadDeAction("editar-producto:guardar", fd);

    expect(reportar).not.toHaveBeenCalled();
  });

  it("reporta pasado el umbral, con la operación y el campo culpable", () => {
    const fd = new FormData();
    fd.append("imagenes", archivoDe(UMBRAL_AVISO_PAYLOAD, "foto.jpg"));

    controlarPayloadDeAction("editar-producto:guardar", fd);

    expect(reportar).toHaveBeenCalledTimes(1);
    const evento = reportar.mock.calls[0][0];
    expect(evento.tipo).toBe("payload-grande");
    expect(evento.detalle.operacion).toBe("editar-producto:guardar");
    expect(evento.detalle.porCampo[0].campo).toBe("imagenes");
    // Justo en el umbral todavía no supera el tope de la plataforma: avisar
    // ANTES de que falle es todo el punto de que los dos números difieran.
    expect(evento.detalle.superaTope).toBe(false);
  });

  it("marca superaTope cuando ya no iba a pasar de la plataforma", () => {
    const fd = new FormData();
    fd.append("imagenes", archivoDe(TOPE_BODY_PLATAFORMA, "foto.jpg"));

    controlarPayloadDeAction("editar-producto:guardar", fd);

    expect(reportar.mock.calls[0][0].detalle.superaTope).toBe(true);
  });

  it("devuelve la medición aunque no reporte", () => {
    const fd = new FormData();
    fd.append("precio", "18000");

    expect(controlarPayloadDeAction("x", fd).bytes).toBe(5);
  });
});
