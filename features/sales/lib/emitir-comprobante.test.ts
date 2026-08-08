import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { emitirComprobante } from "./emitir-comprobante";

/** Supabase mínimo: solo lo que toca emitirComprobante (rpc + insert). */
function fakeSupabase(opts: {
  numero?: number | null;
  errorNumero?: unknown;
  errorInsert?: unknown;
}) {
  const insertados: Record<string, unknown>[] = [];
  const rpcLlamadas: { fn: string; args: unknown }[] = [];

  const supabase = {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcLlamadas.push({ fn, args });
      return {
        data: opts.errorNumero ? null : (opts.numero ?? 1),
        error: opts.errorNumero ?? null,
      };
    }),
    from: vi.fn(() => ({
      insert: async (fila: Record<string, unknown>) => {
        insertados.push(fila);
        return { error: opts.errorInsert ?? null };
      },
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, insertados, rpcLlamadas };
}

const BASE = {
  ventaId: "venta-1",
  receptor: null,
  total: 15000,
  emitidoPor: "user-1",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("emitirComprobante", () => {
  it("emite TICKET y pide el número a la RPC, no a un max()", () => {
    const { supabase, insertados, rpcLlamadas } = fakeSupabase({ numero: 7 });

    return emitirComprobante(supabase, { ...BASE, config: {} }).then((r) => {
      expect(r).toMatchObject({
        ok: true,
        tipo: "TICKET",
        numero: 7,
        puntoVenta: 1,
      });
      // El motivo viaja para poder explicar después por qué salió esto.
      expect(r.motivo).toBeTruthy();
      expect(rpcLlamadas).toEqual([
        {
          fn: "siguiente_numero_comprobante",
          args: { p_punto_venta: 1, p_tipo: "TICKET" },
        },
      ]);
      expect(insertados[0]).toMatchObject({
        venta_id: "venta-1",
        tipo: "TICKET",
        punto_venta: 1,
        numero: 7,
        total: 15000,
        emitido_por: "user-1",
      });
    });
  });

  it("usa el punto de venta configurado cuando existe", async () => {
    const { supabase, insertados } = fakeSupabase({ numero: 1 });

    await emitirComprobante(supabase, {
      ...BASE,
      config: { punto_venta: 4 },
    });

    expect(insertados[0]).toMatchObject({ punto_venta: 4 });
  });

  it("cae a la serie interna 1 si el punto de venta guardado es inválido", async () => {
    const { supabase, insertados } = fakeSupabase({ numero: 1 });

    await emitirComprobante(supabase, {
      ...BASE,
      // 0 no es un punto de venta válido de ARCA. No puede reventar la
      // emisión: la venta ya ocurrió.
      config: { punto_venta: 0 },
    });

    expect(insertados[0]).toMatchObject({ punto_venta: 1 });
  });

  it("congela los datos del receptor en la fila", async () => {
    const { supabase, insertados } = fakeSupabase({ numero: 1 });

    await emitirComprobante(supabase, {
      ...BASE,
      config: {},
      receptor: {
        cliente_id: "cli-1",
        receptor_razon_social: "Comercio SA",
        receptor_cuit: "30111111118",
        receptor_condicion_iva: "Responsable Inscripto",
      },
    });

    expect(insertados[0]).toMatchObject({
      cliente_id: "cli-1",
      receptor_razon_social: "Comercio SA",
      receptor_cuit: "30111111118",
      receptor_condicion_iva: "Responsable Inscripto",
    });
  });

  it("emite TICKET aunque el comercio haya elegido facturar con ARCA", async () => {
    const { supabase, insertados } = fakeSupabase({ numero: 1 });

    const r = await emitirComprobante(supabase, {
      ...BASE,
      config: {
        modo_facturacion: "ARCA",
        comprobante_defecto: "FACTURA_A",
        condicion_iva: "Responsable Inscripto",
      },
    });

    // Sin conexión real a ARCA no hay CAE, y una FACTURA_A sin CAE es un
    // comprobante inválido. La base además lo rechazaría por CHECK.
    expect(r.tipo).toBe("TICKET");
    expect(insertados[0]).toMatchObject({ tipo: "TICKET" });
    expect(insertados[0].cae).toBeUndefined();
  });

  it("NO lanza si falla la numeración: la venta ya se cobró", async () => {
    const { supabase, insertados } = fakeSupabase({
      errorNumero: { message: "boom" },
    });

    const r = await emitirComprobante(supabase, { ...BASE, config: {} });

    expect(r.ok).toBe(false);
    expect(r.numero).toBeNull();
    // Sin número no se intenta insertar nada.
    expect(insertados).toHaveLength(0);
  });

  it("NO lanza si falla el insert, y deja rastro en los logs", async () => {
    const { supabase } = fakeSupabase({
      numero: 3,
      errorInsert: { message: "rls" },
    });

    const r = await emitirComprobante(supabase, { ...BASE, config: {} });

    expect(r.ok).toBe(false);
    // Una venta sin comprobante es un hueco contable: tiene que poder
    // encontrarse después buscando en los logs.
    expect(console.error).toHaveBeenCalledWith(
      "[COMPROBANTE] No se pudo emitir",
      expect.objectContaining({ etapa: "insert", ventaId: "venta-1" }),
    );
  });

  it("tolera config nula sin romper la venta", async () => {
    const { supabase, insertados } = fakeSupabase({ numero: 1 });

    const r = await emitirComprobante(supabase, { ...BASE, config: null });

    expect(r.ok).toBe(true);
    expect(insertados[0]).toMatchObject({ tipo: "TICKET", punto_venta: 1 });
  });
});
