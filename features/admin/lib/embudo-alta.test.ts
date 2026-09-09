import { describe, expect, it } from "vitest";
import {
  analizarEmbudoAlta,
  resumirEmbudoAlta,
  type FilaEmbudoAlta,
} from "./embudo-alta";

const AHORA = new Date("2026-09-09T12:00:00Z");

const fila = (p: Partial<FilaEmbudoAlta> = {}): FilaEmbudoAlta => ({
  id: crypto.randomUUID(),
  email: "alguien@gmail.com",
  registrado: "2026-09-01T10:00:00Z",
  confirmado: null,
  ultimaSesion: null,
  negocioCreado: null,
  miembroDeAlgunNegocio: false,
  invitacionPendiente: false,
  esSuperAdmin: false,
  ...p,
});

describe("el caso que motivó esto", () => {
  it("quedarse después del mail NO es lo mismo que abandonar en el registro", () => {
    // Las cuatro pérdidas de agosto/septiembre: confirmaron el mail, se les
    // emitió sesión y no crearon el negocio. Antes se leían como "se cayeron
    // en el mail" y por eso el arreglo propuesto apuntaba al lugar equivocado.
    const [u] = analizarEmbudoAlta(
      [
        fila({
          email: "daitri94gallardo@gmail.com",
          registrado: "2026-09-09T10:53:02Z",
          confirmado: "2026-09-09T10:53:32Z",
          ultimaSesion: "2026-09-09T10:53:34Z",
        }),
      ],
      { ahora: AHORA },
    );

    expect(u.etapa).toBe("SESION");
    expect(u.minutosHastaConfirmar).toBe(1);
  });

  it("el que nunca confirmó sí se cayó antes", () => {
    const [u] = analizarEmbudoAlta([fila({ email: "maxi_l93@hotmail.com" })], { ahora: AHORA });

    expect(u.etapa).toBe("REGISTRADO");
    expect(u.diasEstancado).toBe(8);
  });
});

describe("etapas", () => {
  it("confirmó pero nunca entró", () => {
    const [u] = analizarEmbudoAlta(
      [fila({ confirmado: "2026-09-01T10:01:00Z" })],
      { ahora: AHORA },
    );
    expect(u.etapa).toBe("CONFIRMADO");
  });

  it("creó su negocio: terminó y no se mide estancamiento", () => {
    const [u] = analizarEmbudoAlta(
      [
        fila({
          confirmado: "2026-09-01T10:01:00Z",
          ultimaSesion: "2026-09-01T10:02:00Z",
          negocioCreado: "2026-09-01T10:05:00Z",
        }),
      ],
      { ahora: AHORA },
    );

    expect(u.etapa).toBe("CREO_NEGOCIO");
    expect(u.diasEstancado).toBeNull();
  });

  it("un empleado que aceptó la invitación llegó al final aunque no creó nada", () => {
    const [u] = analizarEmbudoAlta(
      [fila({ ultimaSesion: "2026-09-02T10:00:00Z", miembroDeAlgunNegocio: true })],
      { ahora: AHORA },
    );

    expect(u.etapa).toBe("CREO_NEGOCIO");
    // Pero no cuenta para la tasa: no vino a abrir un comercio.
    expect(u.fueraDelEmbudo).toBe(true);
  });
});

describe("quién no es una pérdida", () => {
  it("el super admin no tiene negocio propio por diseño", () => {
    const [u] = analizarEmbudoAlta([fila({ esSuperAdmin: true })], { ahora: AHORA });
    expect(u.fueraDelEmbudo).toBe(true);
  });

  it("un invitado que todavía no usó el link", () => {
    // Sin esto se ve idéntico a un dueño que abandonó, y ensucia el agujero
    // con gente que está esperando otra cosa.
    const [u] = analizarEmbudoAlta([fila({ invitacionPendiente: true })], { ahora: AHORA });
    expect(u.fueraDelEmbudo).toBe(true);
  });

  it("pero el dueño que abandonó SÍ cuenta", () => {
    const [u] = analizarEmbudoAlta(
      [fila({ confirmado: "2026-09-01T10:01:00Z", ultimaSesion: "2026-09-01T10:02:00Z" })],
      { ahora: AHORA },
    );
    expect(u.fueraDelEmbudo).toBe(false);
  });
});

describe("resumen", () => {
  const escenario = () =>
    analizarEmbudoAlta(
      [
        // 2 terminaron
        fila({ negocioCreado: "2026-09-02T10:00:00Z", confirmado: "2026-09-01T10:01:00Z", ultimaSesion: "2026-09-01T10:02:00Z" }),
        fila({ negocioCreado: "2026-09-03T10:00:00Z", confirmado: "2026-09-01T10:03:00Z", ultimaSesion: "2026-09-01T10:04:00Z" }),
        // 3 entraron y no crearon nada
        fila({ confirmado: "2026-09-01T10:01:00Z", ultimaSesion: "2026-09-01T10:02:00Z" }),
        fila({ confirmado: "2026-09-01T10:01:00Z", ultimaSesion: "2026-09-01T10:02:00Z" }),
        fila({ confirmado: "2026-09-01T10:01:00Z", ultimaSesion: "2026-09-01T10:02:00Z" }),
        // 1 no confirmó
        fila({}),
        // fuera del embudo
        fila({ esSuperAdmin: true }),
      ],
      { ahora: AHORA },
    );

  it("cuenta los que LLEGARON, no los que quedaron parados", () => {
    const r = resumirEmbudoAlta(escenario());

    expect(r.total).toBe(6);
    expect(r.escalones.map((e) => e.llegaron)).toEqual([6, 5, 5, 2]);
    expect(r.escalones.map((e) => e.porcentaje)).toEqual([100, 83, 83, 33]);
  });

  it("señala el escalón donde se cae más gente", () => {
    const r = resumirEmbudoAlta(escenario());

    expect(r.peorEscalon?.etapa).toBe("SESION");
    expect(r.peorEscalon?.seCayeron).toBe(3);
  });

  it("llegar al final no es caerse", () => {
    const r = resumirEmbudoAlta(escenario());
    const fin = r.escalones.at(-1)!;

    expect(fin.etapa).toBe("CREO_NEGOCIO");
    expect(fin.seCayeron).toBe(0);
  });

  it("usa mediana y no promedio para el tiempo de confirmación", () => {
    // Uno que confirma tres días después corre el promedio y hace parecer que
    // el mail tarda, cuando el resto confirmó en un minuto.
    const usuarios = analizarEmbudoAlta(
      [
        fila({ confirmado: "2026-09-01T10:01:00Z" }),
        fila({ confirmado: "2026-09-01T10:01:00Z" }),
        fila({ confirmado: "2026-09-04T10:00:00Z" }),
      ],
      { ahora: AHORA },
    );

    expect(resumirEmbudoAlta(usuarios).medianaMinutosConfirmar).toBe(1);
  });

  it("sin nadie, no inventa números", () => {
    const r = resumirEmbudoAlta([]);

    expect(r.total).toBe(0);
    expect(r.peorEscalon).toBeNull();
    expect(r.medianaMinutosConfirmar).toBeNull();
    expect(r.escalones.every((e) => e.porcentaje === 0)).toBe(true);
  });
});

describe("sesión del link vs. vuelta real", () => {
  it("la sesión que emite el mail no es haber entrado", () => {
    // daitri94gallardo, 9/9/2026: confirmó 10:53:32 y `last_sign_in_at` quedó
    // en 10:53:34 — dos segundos, que es lo que tarda el callback en canjear.
    // No tocó nada, y con el bug del doble canje lo único que vio fue "El
    // enlace venció".
    const [u] = analizarEmbudoAlta(
      [
        fila({
          confirmado: "2026-09-09T10:53:32Z",
          ultimaSesion: "2026-09-09T10:53:34Z",
        }),
      ],
      { ahora: AHORA },
    );

    expect(u.etapa).toBe("SESION");
    expect(u.sesionSoloDelLink).toBe(true);
  });

  it("volver a entrar después SÍ se distingue", () => {
    const [u] = analizarEmbudoAlta(
      [
        fila({
          confirmado: "2026-09-07T22:43:46Z",
          ultimaSesion: "2026-09-07T22:57:51Z",
        }),
      ],
      { ahora: AHORA },
    );

    expect(u.sesionSoloDelLink).toBe(false);
  });

  it("sin confirmar no se puede afirmar nada", () => {
    const [u] = analizarEmbudoAlta(
      [fila({ ultimaSesion: "2026-09-02T10:00:00Z" })],
      { ahora: AHORA },
    );

    expect(u.sesionSoloDelLink).toBe(false);
  });
});

describe("cuentas de prueba", () => {
  it("un subaddress de una casilla registrada se deduce solo", () => {
    // `ignacionweppler+4@gmail.com` cae en el MISMO buzón que
    // `ignacionweppler@gmail.com`. Si las dos están registradas, son de la
    // misma persona: una cuenta extra en tu propio mail es una prueba.
    const usuarios = analizarEmbudoAlta(
      [
        fila({ email: "ignacionweppler@gmail.com", esSuperAdmin: true }),
        fila({ email: "ignacionweppler+4@gmail.com" }),
      ],
      { ahora: AHORA },
    );

    const alias = usuarios[1];
    expect(alias.pruebaDeducida).toBe(true);
    expect(alias.esPrueba).toBe(true);
    expect(alias.fueraDelEmbudo).toBe(true);
  });

  it("sin la casilla base registrada, NO se deduce nada", () => {
    // Un cliente real puede usar `+algo` sin tener la base en Comerz.
    // Marcarlo como prueba sería esconder un candidato de verdad.
    const [u] = analizarEmbudoAlta(
      [fila({ email: "clienta+comerz@gmail.com" })],
      { ahora: AHORA },
    );

    expect(u.pruebaDeducida).toBe(false);
    expect(u.esPrueba).toBe(false);
  });

  it("no se adivina por el nombre del mail", () => {
    // Nada de buscar "test" o "prueba" en la dirección: esconder un cliente
    // real del embudo es peor que contar una prueba de más.
    const [u] = analizarEmbudoAlta(
      [fila({ email: "testerodelsur@gmail.com" })],
      { ahora: AHORA },
    );

    expect(u.esPrueba).toBe(false);
  });

  it("la marca a mano cubre la prueba hecha con otro mail", () => {
    const id = crypto.randomUUID();
    const [u] = analizarEmbudoAlta([fila({ id, email: "otra@gmail.com" })], {
      ahora: AHORA,
      marcadosComoPrueba: new Set([id]),
    });

    expect(u.esPrueba).toBe(true);
    // No se deduce: fue una decisión, y se distingue para poder revisarla.
    expect(u.pruebaDeducida).toBe(false);
  });

  it("salen del denominador y se cuentan aparte", () => {
    const r = resumirEmbudoAlta(
      analizarEmbudoAlta(
        [
          fila({ email: "yo@gmail.com", negocioCreado: "2026-09-02T10:00:00Z" }),
          fila({ email: "yo+1@gmail.com" }),
          fila({ email: "yo+2@gmail.com" }),
          fila({ email: "clienta@gmail.com" }),
        ],
        { ahora: AHORA },
      ),
    );

    expect(r.total).toBe(2);
    expect(r.pruebas).toBe(2);
  });
});
