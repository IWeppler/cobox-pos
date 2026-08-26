import { describe, expect, it } from "vitest";
import {
  construirFeed,
  derivarPendientes,
  type EventoParaFeed,
  type NegocioParaFeed,
} from "./feed-notificaciones";

const AHORA = new Date("2026-08-14T12:00:00Z");

function negocio(over: Partial<NegocioParaFeed> = {}): NegocioParaFeed {
  return {
    id: "n1",
    nombre: "Comercio",
    estado: "activo",
    plan_id: "p1",
    plan_nombre: "Gestión",
    plan_vencimiento: "2026-09-30",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("derivarPendientes", () => {
  it("un mes vencido es urgente y dice hace cuánto", () => {
    const [aviso] = derivarPendientes(
      [negocio({ plan_vencimiento: "2026-08-11" })],
      AHORA,
    );
    expect(aviso.titulo).toBe("Mes vencido");
    expect(aviso.detalle).toBe("Venció hace 3 días.");
    expect(aviso.severidad).toBe("urgente");
  });

  it("distingue la prueba terminada de un mes impago", () => {
    // No es lo mismo: uno debe plata, el otro todavía no eligió plan.
    const [aviso] = derivarPendientes(
      [negocio({ plan_nombre: "Prueba", plan_vencimiento: "2026-08-13" })],
      AHORA,
    );
    expect(aviso.titulo).toBe("Se le terminó la prueba");
    expect(aviso.detalle).toContain("todavía no eligió plan");
  });

  it("avisa antes de vencer, con umbral más corto en la prueba", () => {
    // La prueba dura 14 días: avisar con 15 sería avisar el día uno.
    const pago = derivarPendientes(
      [negocio({ plan_vencimiento: "2026-08-20" })],
      AHORA,
    );
    const prueba = derivarPendientes(
      [negocio({ plan_nombre: "Prueba", plan_vencimiento: "2026-08-20" })],
      AHORA,
    );

    expect(pago[0].titulo).toBe("Está por vencer");
    expect(prueba).toHaveLength(0);
  });

  it("la prueba avisa cuando quedan 3 días o menos", () => {
    const [aviso] = derivarPendientes(
      [negocio({ plan_nombre: "Prueba", plan_vencimiento: "2026-08-16" })],
      AHORA,
    );
    expect(aviso.titulo).toBe("La prueba está por terminar");
    expect(aviso.detalle).toBe("Vence en 2 días.");
    expect(aviso.severidad).toBe("urgente");
  });

  it("un comercio dado de baja no genera pendientes", () => {
    // Ya se fue: seguir avisando que venció es ruido sobre algo incobrable.
    const pendientes = derivarPendientes(
      [negocio({ estado: "cancelado", plan_vencimiento: "2026-01-01" })],
      AHORA,
    );
    expect(pendientes).toHaveLength(0);
  });

  it("un comercio demo tampoco: no se le cobra", () => {
    // Vencido y sin plan a la vez, o sea los dos avisos posibles. Ninguno
    // corresponde: el comercio de muestra no tiene cobranza que reclamar.
    const pendientes = derivarPendientes(
      [
        negocio({
          estado: "demo",
          plan_id: null,
          plan_vencimiento: "2026-01-01",
        }),
      ],
      AHORA,
    );
    expect(pendientes).toHaveLength(0);
  });

  it("sin plan asignado avisa aunque no haya vencimiento", () => {
    const [aviso] = derivarPendientes(
      [negocio({ plan_id: null, plan_nombre: null, plan_vencimiento: null })],
      AHORA,
    );
    expect(aviso.titulo).toBe("Sin plan asignado");
  });

  it("lejos del vencimiento no dice nada", () => {
    expect(derivarPendientes([negocio()], AHORA)).toHaveLength(0);
  });

  it("las derivadas fechan en el hecho, no en 'ahora'", () => {
    // Si usaran ahora, saltarían al tope en cada refresh y taparían el resto.
    const [aviso] = derivarPendientes(
      [negocio({ plan_vencimiento: "2026-08-11" })],
      AHORA,
    );
    expect(aviso.fecha).toBe("2026-08-11");
  });
});

describe("construirFeed", () => {
  const evento: EventoParaFeed = {
    id: "e1",
    negocio_id: "n2",
    negocio: "Otro",
    tipo: "NEGOCIO_CREADO",
    detalle: { nombre: "Otro" },
    creado_en: "2026-08-14T10:00:00Z",
    visto_en: null,
  };

  it("lo urgente va arriba aunque sea más viejo que un alta de hoy", () => {
    const feed = construirFeed(
      [negocio({ plan_vencimiento: "2026-08-01" })],
      [evento],
      AHORA,
    );
    expect(feed[0].titulo).toBe("Mes vencido");
    expect(feed[1].titulo).toBe("Comercio nuevo");
  });

  it("solo los hechos se pueden marcar como vistos", () => {
    const feed = construirFeed(
      [negocio({ plan_vencimiento: "2026-08-01" })],
      [evento],
      AHORA,
    );
    const vencido = feed.find((f) => f.titulo === "Mes vencido");
    const alta = feed.find((f) => f.titulo === "Comercio nuevo");

    // Un pendiente derivado no es un aviso que se descarta: se va cuando se
    // resuelve la causa.
    expect(vencido?.accionable).toBe(false);
    expect(alta?.accionable).toBe(true);
    expect(alta?.eventoId).toBe("e1");
  });

  it("un pedido de plan pesa más que la actividad normal", () => {
    const feed = construirFeed(
      [],
      [
        evento,
        {
          ...evento,
          id: "e2",
          tipo: "SOLICITUD_PLAN",
          detalle: { desde: "Emprendedor", hasta: "Gestión" },
          creado_en: "2026-08-13T10:00:00Z",
        },
      ],
      AHORA,
    );
    expect(feed[0].titulo).toBe("Pidió cambiar de plan");
    expect(feed[0].detalle).toBe("Emprendedor → Gestión");
  });
});
