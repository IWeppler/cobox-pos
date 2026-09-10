import { describe, expect, it } from "vitest";
import {
  buscarDuplicado,
  mensajeDeDuplicado,
  type ProductoComparable,
} from "./duplicado-de-producto";

const CAT_REMERAS = "cat-remeras";
const CAT_HOMBRE = "cat-hombre";

const p = (
  id: string,
  nombre: string,
  categoriaId: string | null = CAT_REMERAS,
  marca: string | null = null,
): ProductoComparable => ({ id, nombre, categoriaId, marca });

describe("el caso del 10/9: el remito creó un producto que ya existía", () => {
  it("mismo nombre, misma categoría, misma marca es IDENTICO", () => {
    const d = buscarDuplicado(p("nuevo", "REMERONES VANIC OVERSIZE"), [
      p("viejo", "REMERONES VANIC OVERSIZE"),
    ]);

    expect(d?.nivel).toBe("IDENTICO");
    expect(d?.producto.id).toBe("viejo");
  });

  it("no se compara consigo mismo al editar", () => {
    expect(
      buscarDuplicado(p("mismo", "REMERONES VANIC OVERSIZE"), [
        p("mismo", "REMERONES VANIC OVERSIZE"),
      ]),
    ).toBeNull();
  });
});

describe("los 31 que NO son errores", () => {
  it("la misma remera en otra categoría no es duplicado del que importa", () => {
    // Esto lo corrigió la dueña: contar por nombre daba 42, y 31 eran esto.
    const d = buscarDuplicado(p("nuevo", "REMERA BASICA", CAT_HOMBRE), [
      p("otro", "REMERA BASICA", CAT_REMERAS),
    ]);

    expect(d?.nivel).toBe("MISMO_NOMBRE");
  });

  it("la misma prenda de otra marca tampoco", () => {
    const d = buscarDuplicado(
      p("nuevo", "REMERA BASICA", CAT_REMERAS, "VANIC"),
      [p("otro", "REMERA BASICA", CAT_REMERAS, "KB")],
    );

    expect(d?.nivel).toBe("MISMO_NOMBRE");
  });

  it("un idéntico le gana a un homónimo, esté en el orden que esté", () => {
    const existentes = [
      p("homonimo", "REMERA BASICA", CAT_HOMBRE),
      p("identico", "REMERA BASICA", CAT_REMERAS),
    ];

    expect(buscarDuplicado(p("nuevo", "REMERA BASICA"), existentes)?.producto.id)
      .toBe("identico");
  });
});

describe("cómo se compara el texto", () => {
  it("mayúsculas, acentos y espacios de más no hacen a otro producto", () => {
    const d = buscarDuplicado(p("nuevo", "  camisón  ÑOÑO "), [
      p("viejo", "CAMISON ñoño"),
    ]);

    expect(d?.nivel).toBe("IDENTICO");
  });

  it("un nombre vacío no dispara nada", () => {
    expect(buscarDuplicado(p("nuevo", "   "), [p("viejo", "")])).toBeNull();
  });

  it("marca vacía y marca null son lo mismo", () => {
    const d = buscarDuplicado(p("nuevo", "SHORT", CAT_REMERAS, ""), [
      p("viejo", "SHORT", CAT_REMERAS, null),
    ]);

    expect(d?.nivel).toBe("IDENTICO");
  });
});

describe("el mensaje", () => {
  it("el de idéntico dice qué hacer, no solo qué pasa", () => {
    const d = buscarDuplicado(p("nuevo", "REMERONES VANIC OVERSIZE"), [
      p("viejo", "REMERONES VANIC OVERSIZE"),
    ])!;

    const texto = mensajeDeDuplicado(d, "REMERAS, BLUSAS Y CAMISAS");
    expect(texto).toContain("REMERAS, BLUSAS Y CAMISAS");
    expect(texto).toMatch(/cargale el stock a ese/i);
  });

  it("el de homónimo NO recomienda nada", () => {
    const d = buscarDuplicado(p("nuevo", "REMERA BASICA", CAT_HOMBRE), [
      p("otro", "REMERA BASICA", CAT_REMERAS),
    ])!;

    const texto = mensajeDeDuplicado(d);
    expect(texto).toMatch(/suele ser correcto/i);
    expect(texto).not.toMatch(/cargale el stock/i);
  });
});
