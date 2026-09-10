import { describe, expect, it } from "vitest";
import {
  campanaQueCorresponde,
  claveDeEnvio,
  construirCampanaNegocio,
  type NegocioEnCiclo,
} from "./campanas-negocio";
import { renderizarCampana } from "./campanas-email";

const AHORA = new Date("2026-09-10T12:00:00Z");
const LINK = "https://mpago.la/abc123";

const negocio = (p: Partial<NegocioEnCiclo> = {}): NegocioEnCiclo => ({
  negocioId: "n1",
  nombre: "Estilo Bonito",
  estado: "prueba",
  creado: "2026-08-27T10:00:00Z",
  planVencimiento: "2026-09-13T10:00:00Z",
  planNombre: "Gestión",
  planPrecio: 50000,
  planLink: null,
  duenioId: "u1",
  duenioEmail: "duenia@gmail.com",
  productos: 47,
  ventas: 12,
  ultimaVenta: "2026-09-10T09:00:00Z",
  pagos: 0,
  ...p,
});

describe("qué mail le toca a cada comercio", () => {
  it("a tres días del vencimiento, fin de prueba", () => {
    expect(campanaQueCorresponde(negocio(), AHORA)).toBe("fin_de_prueba");
  });

  it("el que no cargó NADA recibe la variante de ayuda, no la de plan", () => {
    // Ninja Camisetas y PequeñasGigantes: 0 productos, 0 ventas. Pedirles
    // plata es pedirles plata por algo que no llegaron a ver.
    expect(
      campanaQueCorresponde(
        negocio({ productos: 0, ventas: 0, ultimaVenta: null }),
        AHORA,
      ),
    ).toBe("fin_de_prueba_sin_uso");
  });

  it("una prueba vencida hace poco entra en la ventana de recuperación", () => {
    expect(
      campanaQueCorresponde(
        negocio({ planVencimiento: "2026-09-05T10:00:00Z" }),
        AHORA,
      ),
    ).toBe("prueba_vencida");
  });

  it("una prueba vencida hace meses ya no recibe nada", () => {
    // Ninja Camisetas venció el 17/8: a más de 30 días no es una recuperación,
    // es un mail a alguien que se fue.
    expect(
      campanaQueCorresponde(
        negocio({
          planVencimiento: "2026-06-17T10:00:00Z",
          productos: 0,
          ventas: 0,
          ultimaVenta: null,
        }),
        AHORA,
      ),
    ).toBeNull();
  });

  it("al activo que renueva en dos días le toca el aviso de cobro", () => {
    expect(
      campanaQueCorresponde(
        negocio({ estado: "activo", planVencimiento: "2026-09-12T10:00:00Z" }),
        AHORA,
      ),
    ).toBe("aviso_cobro");
  });

  it("al activo atrasado le toca el recordatorio", () => {
    // Evens: venció el 4/9 y sigue activo.
    expect(
      campanaQueCorresponde(
        negocio({ estado: "activo", planVencimiento: "2026-09-04T10:00:00Z" }),
        AHORA,
      ),
    ).toBe("recordatorio_cobro");
  });

  it("diez días sin vender es inactividad", () => {
    expect(
      campanaQueCorresponde(
        negocio({
          estado: "activo",
          planVencimiento: "2026-10-05T10:00:00Z",
          ultimaVenta: "2026-08-28T10:00:00Z",
        }),
        AHORA,
      ),
    ).toBe("inactividad");
  });

  it("el que NUNCA vendió no es inactividad: todavía no empezó", () => {
    // Dejar de usarlo y no haber empezado piden cosas opuestas: uno es
    // retención, el otro activación.
    expect(
      campanaQueCorresponde(
        negocio({
          estado: "activo",
          planVencimiento: "2026-10-05T10:00:00Z",
          ultimaVenta: null,
          ventas: 0,
        }),
        AHORA,
      ),
    ).toBeNull();
  });

  it("vencer manda sobre no vender: sale un mail, no dos", () => {
    const c = campanaQueCorresponde(
      negocio({
        estado: "activo",
        planVencimiento: "2026-09-11T10:00:00Z",
        ultimaVenta: "2026-08-01T10:00:00Z",
      }),
      AHORA,
    );
    expect(c).toBe("aviso_cobro");
  });
});

describe("a quién no se le escribe nunca", () => {
  it("al comercio demo", () => {
    // Kiosco Demo y Nombre de Prueba2: son la muestra de los vendedores, no
    // clientes. Tienen vencimiento pasado y quedarían en recordatorio de cobro.
    expect(
      campanaQueCorresponde(
        negocio({ estado: "demo", planVencimiento: "2026-08-27T10:00:00Z" }),
        AHORA,
      ),
    ).toBeNull();
  });

  it("al que se dio de baja", () => {
    expect(
      campanaQueCorresponde(negocio({ estado: "cancelado" }), AHORA),
    ).toBeNull();
  });

  it("al suspendido", () => {
    expect(
      campanaQueCorresponde(negocio({ estado: "suspendido" }), AHORA),
    ).toBeNull();
  });
});

describe("el texto", () => {
  it("el de fin de prueba lleva lo que la persona hizo, con sus números", () => {
    const c = construirCampanaNegocio("fin_de_prueba", negocio(), {
      ahora: AHORA,
    })!;
    const t = c.intro.join(" ");

    expect(t).toContain("47 productos");
    expect(t).toContain("12 ventas");
    expect(t).toContain("Estilo Bonito");
  });

  it("el de sin uso NO pide elegir un plan", () => {
    const c = construirCampanaNegocio(
      "fin_de_prueba_sin_uso",
      negocio({ productos: 0, ventas: 0 }),
      { ahora: AHORA },
    )!;

    expect(c.cta.texto).not.toMatch(/plan/i);
    expect(c.asunto).toContain("arrancar");
  });

  it("singular y plural: un producto no es '1 productos'", () => {
    const c = construirCampanaNegocio(
      "fin_de_prueba",
      negocio({ productos: 1, ventas: 1 }),
      { ahora: AHORA },
    )!;
    const t = c.intro.join(" ");

    expect(t).toContain("1 producto ");
    expect(t).toContain("1 venta");
    expect(t).not.toContain("1 productos");
  });

  it("el de prueba vencida promete que los datos siguen ahí", () => {
    const c = construirCampanaNegocio(
      "prueba_vencida",
      negocio({ planVencimiento: "2026-09-05T10:00:00Z" }),
      { ahora: AHORA },
    )!;

    expect(c.intro.join(" ")).toMatch(/no se borró nada|sigue ahí/i);
  });
});

describe("las de cobro sin link de pago", () => {
  it("no se arman: un aviso de cobro sin cómo pagar es trabajo para el otro", () => {
    // Fail-closed. Es preferible que el botón no exista a mandar el mail a
    // medias, porque el link ES el mail.
    expect(
      construirCampanaNegocio(
        "aviso_cobro",
        negocio({ estado: "activo" }),
        { ahora: AHORA },
      ),
    ).toBeNull();

    expect(
      construirCampanaNegocio(
        "recordatorio_cobro",
        negocio({ estado: "activo" }),
        { ahora: AHORA },
      ),
    ).toBeNull();
  });

  it("con link, el CTA apunta al link y no a la app", () => {
    const c = construirCampanaNegocio(
      "aviso_cobro",
      negocio({ estado: "activo", planVencimiento: "2026-09-12T10:00:00Z" }),
      { ahora: AHORA, linkDePago: LINK },
    )!;

    const { html, texto } = renderizarCampana(c, {
      urlBase: "https://app.comerz.app",
      envioId: "11111111-2222-3333-4444-555555555555",
    });

    // Sin el manejo de rutas absolutas, esto quedaría
    // "https://app.comerz.app/https://mpago.la/..." — el link roto justo en el
    // único mail donde el link es el punto.
    expect(html).toContain(`href="${LINK}"`);
    expect(texto).toContain(LINK);
  });

  it("el importe sale del plan del comercio", () => {
    const c = construirCampanaNegocio(
      "aviso_cobro",
      negocio({ estado: "activo", planVencimiento: "2026-09-12T10:00:00Z" }),
      { ahora: AHORA, linkDePago: LINK },
    )!;

    expect(c.intro.join(" ")).toContain("50.000");
  });
});

describe("suscripción y alias", () => {
  const SUSCRIPCION = "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=abc";
  const activo = negocio({
    estado: "activo",
    planVencimiento: "2026-09-12T10:00:00Z",
  });

  it("el link del PLAN le gana al de respaldo", () => {
    // El importe de una suscripción es fijo: un link único mandaría al de
    // Empresa a adherirse al precio de Emprendedor.
    const c = construirCampanaNegocio(
      "aviso_cobro",
      { ...activo, planLink: SUSCRIPCION },
      { ahora: AHORA, linkDePago: LINK },
    )!;

    expect(c.cta.ruta).toBe(SUSCRIPCION);
  });

  it("con link de plan el texto habla de ADHERIRSE, no de pagar una vez", () => {
    const c = construirCampanaNegocio(
      "aviso_cobro",
      { ...activo, planLink: SUSCRIPCION },
      { ahora: AHORA },
    )!;

    expect(c.cta.texto).toMatch(/adherirme/i);
    expect(c.intro.join(" ")).toContain("se debita solo");
    // Un débito automático se avisa entero o no se avisa: cómo se cancela va
    // en el mismo párrafo que la adhesión.
    expect(c.intro.join(" ")).toMatch(/cancelás cuando quieras/i);
  });

  it("con link de respaldo el texto NO promete débito automático", () => {
    const c = construirCampanaNegocio("aviso_cobro", activo, {
      ahora: AHORA,
      linkDePago: LINK,
    })!;

    expect(c.cta.texto).toBe("Pagar ahora");
    expect(c.intro.join(" ")).not.toContain("se debita solo");
  });

  it("el alias va como SEGUNDA opción, con el importe al lado", () => {
    const c = construirCampanaNegocio(
      "aviso_cobro",
      { ...activo, planLink: SUSCRIPCION },
      { ahora: AHORA, alias: "ignacioweppler.mp" },
    )!;

    expect(c.cierre.join(" ")).toContain("ignacioweppler.mp");
    expect(c.cierre.join(" ")).toContain("50.000");
    // Nunca en lugar del botón: el alias obliga a mandar comprobante y a
    // cargarlo a mano, que es el trabajo que la suscripción saca del medio.
    expect(c.cta.ruta).toBe(SUSCRIPCION);
  });

  it("sin alias no queda un párrafo vacío", () => {
    const c = construirCampanaNegocio(
      "aviso_cobro",
      { ...activo, planLink: SUSCRIPCION },
      { ahora: AHORA },
    )!;

    expect(c.cierre.some((p) => p.includes("alias"))).toBe(false);
    expect(c.cierre.every((p) => p.trim().length > 0)).toBe(true);
  });

  it("el alias SOLO no alcanza para armar el mail", () => {
    // Sin link no hay botón, y un mail de cobro que es solo un alias es el
    // trabajo manual que esto viene a sacar.
    expect(
      construirCampanaNegocio("aviso_cobro", activo, {
        ahora: AHORA,
        alias: "ignacioweppler.mp",
      }),
    ).toBeNull();
  });

  it("el recordatorio con suscripción ofrece ponerlo automático", () => {
    const c = construirCampanaNegocio(
      "recordatorio_cobro",
      {
        ...activo,
        planVencimiento: "2026-09-04T10:00:00Z",
        planLink: SUSCRIPCION,
      },
      { ahora: AHORA, alias: "ignacioweppler.mp" },
    )!;

    expect(c.cta.texto).toMatch(/automático/i);
    expect(c.cierre.join(" ")).toContain("ignacioweppler.mp");
  });
});

describe("la clave de envío", () => {
  it("las de cobro llevan el período: se repiten todos los meses", () => {
    // Sin el período, el unique de `envios_email` dejaría mandar el aviso de
    // cobro UNA sola vez en la vida del comercio.
    expect(
      claveDeEnvio(
        "aviso_cobro",
        negocio({ planVencimiento: "2026-09-12T10:00:00Z" }),
      ),
    ).toBe("aviso_cobro:2026-09");

    expect(
      claveDeEnvio(
        "aviso_cobro",
        negocio({ planVencimiento: "2026-10-12T10:00:00Z" }),
      ),
    ).not.toBe("aviso_cobro:2026-09");
  });

  it("el período es el del VENCIMIENTO, no el de hoy", () => {
    // Un recordatorio mandado el 3 de octubre por un vencimiento del 28 de
    // septiembre pertenece a septiembre: si tomara el mes de hoy, saldría dos
    // veces por el mismo período.
    expect(
      claveDeEnvio(
        "recordatorio_cobro",
        negocio({ planVencimiento: "2026-09-28T10:00:00Z" }),
      ),
    ).toBe("recordatorio_cobro:2026-09");
  });

  it("las que pasan una sola vez no llevan período", () => {
    expect(claveDeEnvio("fin_de_prueba", negocio())).toBe("fin_de_prueba");
    expect(claveDeEnvio("inactividad", negocio())).toBe("inactividad");
  });
});
