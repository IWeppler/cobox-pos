import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "./cart-store";
import type { CartItemStore } from "@/entities/cart/types";

const item = (productoId: string): CartItemStore =>
  ({
    productoId,
    varianteId: `${productoId}-v1`,
    nombre: "Remera blanca",
    variante: "M",
    precio: 12000,
    cantidad: 1,
    stockMaximo: 10,
  }) as CartItemStore;

const EVENS = "44468525-8381-4c83-a558-eb7209e386b5";
const CLICKTOSTADO = "1844badf-1a9a-457c-bfee-4d10122337e8";

describe("sincronizarNegocio", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], negocioId: null, isOpen: false });
  });

  it("adopta el negocio activo cuando el carrito está vacío", () => {
    useCartStore.getState().sincronizarNegocio(EVENS);

    expect(useCartStore.getState().negocioId).toBe(EVENS);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("no toca el carrito si el negocio no cambió", () => {
    useCartStore.setState({ items: [item("a")], negocioId: EVENS });

    useCartStore.getState().sincronizarNegocio(EVENS);

    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it("vacía el carrito al cambiar de comercio", () => {
    // El caso real: la dueña arma un carrito en ClickTostado, cambia a Evens
    // desde el switcher (navegación blanda, el POS no se desmonta) y esos
    // productos —precios, variantes y stock de otro negocio— quedaban vivos.
    useCartStore.setState({ items: [item("a")], negocioId: CLICKTOSTADO });

    useCartStore.getState().sincronizarNegocio(EVENS);

    expect(useCartStore.getState().negocioId).toBe(EVENS);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("vacía un carrito guardado sin negocio: no hay forma de saber de quién era", () => {
    useCartStore.setState({ items: [item("a")], negocioId: null });

    useCartStore.getState().sincronizarNegocio(EVENS);

    expect(useCartStore.getState().items).toEqual([]);
  });

  it("sin negocio activo no vacía nada: es un estado en tránsito, no un cambio", () => {
    useCartStore.setState({ items: [item("a")], negocioId: EVENS });

    useCartStore.getState().sincronizarNegocio(null);

    expect(useCartStore.getState().items).toHaveLength(1);
    // Y conserva el sello: si se perdiera, la próxima sincronización con el
    // mismo negocio lo leería como un cambio y vaciaría un carrito sano.
    expect(useCartStore.getState().negocioId).toBe(EVENS);
  });

  it("un render en tránsito no hace que la siguiente sincronización vacíe el carrito", () => {
    useCartStore.setState({ items: [item("a")], negocioId: EVENS });

    useCartStore.getState().sincronizarNegocio(null);
    useCartStore.getState().sincronizarNegocio(EVENS);

    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
