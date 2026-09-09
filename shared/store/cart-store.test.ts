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

describe("setListaPrecio", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      negocioId: EVENS,
      listaPrecioId: null,
      isOpen: false,
    });
  });

  const MAYORISTA = "lista-mayorista";

  it("cambia la lista y los precios en la MISMA escritura", () => {
    // Con dos escrituras habría un render con la lista nueva y los precios
    // viejos, que es justo el instante en el que alguien confirma la venta.
    useCartStore.setState({ items: [item("a")] });

    useCartStore.getState().setListaPrecio(MAYORISTA, {
      "a|M": { precio: 9600, precioBase: 12000 },
    });

    const estado = useCartStore.getState();
    expect(estado.listaPrecioId).toBe(MAYORISTA);
    expect(estado.items[0].precio).toBe(9600);
    expect(estado.items[0].precioBase).toBe(12000);
  });

  it("sella `precioBase`, y por eso re-preciar dos veces NO descuenta dos veces", () => {
    // El bug que este sello evita: una línea que entró desde Inventario no
    // trae base, así que la segunda pasada tomaría el precio YA descontado
    // como base y le volvería a aplicar la lista.
    useCartStore.setState({ items: [item("a")] });

    const aplicar = () => {
      const linea = useCartStore.getState().items[0];
      const base = linea.precioBase ?? linea.precio;
      useCartStore.getState().setListaPrecio(MAYORISTA, {
        "a|M": { precio: Math.round(base * 0.8), precioBase: base },
      });
    };

    aplicar();
    aplicar();

    expect(useCartStore.getState().items[0].precio).toBe(9600);
    expect(useCartStore.getState().items[0].precioBase).toBe(12000);
  });

  it("volver a Base devuelve el precio de siempre", () => {
    useCartStore.setState({
      items: [{ ...item("a"), precio: 9600, precioBase: 12000 }],
      listaPrecioId: MAYORISTA,
    });

    useCartStore.getState().setListaPrecio(null, {
      "a|M": { precio: 12000, precioBase: 12000 },
    });

    expect(useCartStore.getState().listaPrecioId).toBeNull();
    expect(useCartStore.getState().items[0].precio).toBe(12000);
  });

  it("una línea sin entrada en el mapa queda como está", () => {
    useCartStore.setState({ items: [item("a"), item("b")] });

    useCartStore.getState().setListaPrecio(MAYORISTA, {
      "a|M": { precio: 9600, precioBase: 12000 },
    });

    expect(useCartStore.getState().items[1].precio).toBe(12000);
    expect(useCartStore.getState().items[1].precioBase).toBeUndefined();
  });

  it("cambiar de negocio descarta la lista, aunque el carrito esté vacío", () => {
    // `listas_precios` es por negocio: un id de otro comercio no lo devuelve
    // ni la RLS.
    useCartStore.setState({ items: [], listaPrecioId: MAYORISTA });

    useCartStore.getState().sincronizarNegocio(CLICKTOSTADO);

    expect(useCartStore.getState().listaPrecioId).toBeNull();
  });

  it("y también cuando el carrito tenía mercadería", () => {
    useCartStore.setState({ items: [item("a")], listaPrecioId: MAYORISTA });

    useCartStore.getState().sincronizarNegocio(CLICKTOSTADO);

    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().listaPrecioId).toBeNull();
  });
});
