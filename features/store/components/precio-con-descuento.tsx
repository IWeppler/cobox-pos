"use client";

import { useMejorDescuentoPorMetodo } from "./descuentos-pago-provider";
import type { DescuentoPorMetodo } from "@/shared/lib/totales-pedido-publico";

/**
 * El precio de un producto en el catálogo, y lo que se ahorra eligiendo cómo
 * pagar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS FORMAS, Y LA DIFERENCIA ES LA DENSIDAD, NO EL GUSTO
 *
 * En la GRILLA va un badge al lado del precio, en la misma fila:
 *
 *   $20.000            [20% OFF efectivo]
 *
 * Cuesta 0px de alto. La versión anterior —una segunda línea con el precio ya
 * calculado— sumaba 18px por tarjeta, que sobre un paso de fila de ~312px en
 * mobile son ~6% menos productos por pantalla. Con catálogos de más de mil
 * productos, eso es scroll que se paga en cada visita a cambio de un dato que
 * en la grilla solo tiene que despertar el interés.
 *
 * En la FICHA va la línea completa con el precio calculado:
 *
 *   $20.000
 *   $16.000 pagando en efectivo
 *
 * Ahí no hay problema de densidad y sí hay una decisión que tomar, así que el
 * número exacto vale más que el incentivo: es el que la clienta va a comparar
 * con el desglose del carrito.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * EL PRECIO DE LISTA NO CAMBIA: la clase con la que se dibuja la pasa cada
 * pantalla —`classNamePrecio`— y son exactamente las que ya tenían la tarjeta y
 * la ficha. Es a propósito que este componente no elija esa tipografía: la
 * grilla y el detalle jerarquizan distinto, y unificarlas acá habría cambiado
 * el precio de lista de las dos con la excusa de agregar un descuento.
 *
 * NO SE DIBUJA NADA si no hay descuento: ni "0% OFF" ni un espacio reservado
 * esperando. Un hueco en cada tarjeta de un catálogo sin promos es ruido
 * permanente a cambio de una alineación que nadie mira.
 *
 * TAMPOCO SE MUESTRAN RECARGOS acá, y por eso solo se consideran métodos que no
 * los tengan (ver `mejorDescuentoPorMetodo`). El recargo aparece una sola vez
 * en toda la tienda: en el desglose del paso 2, cuando la clienta eligió ese
 * método.
 */
export function PrecioConDescuento({
  precio,
  categoria,
  classNamePrecio,
  tamano = "card",
}: Readonly<{
  precio: number;
  /** `productos.tipo`: contra esto matchean las promos por categoría. */
  categoria?: string | null;
  /** La tipografía del precio de lista, tal cual la tenía cada pantalla. */
  classNamePrecio: string;
  /** "card" en la grilla (badge), "ficha" en el detalle (línea completa). */
  tamano?: "card" | "ficha";
}>) {
  const descuento = useMejorDescuentoPorMetodo(precio, categoria);

  if (tamano === "ficha") {
    return (
      <div className="min-w-0">
        <span className={classNamePrecio}>
          ${precio.toLocaleString("es-AR")}
        </span>
        {descuento && (
          <p className="mt-1.5 truncate text-sm font-normal text-success">
            ${descuento.precio.toLocaleString("es-AR")} pagando en{" "}
            {descuento.metodo}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      {/* El precio NO se encoge: es el dato principal y tiene que entrar
          entero aunque sea de siete cifras. Lo que cede es el badge. */}
      <span className={`shrink-0 ${classNamePrecio}`}>
        ${precio.toLocaleString("es-AR")}
      </span>
      {descuento && <BadgeDescuento descuento={descuento} />}
    </div>
  );
}

/**
 * El incentivo en una tarjeta de 170px de ancho.
 *
 * SE TRUNCA POR EL FINAL Y ESO ESTÁ PENSADO: primero va el ahorro y después el
 * método, así que cuando no entra —"20% OFF transferencia" al lado de un precio
 * de siete cifras— lo que se pierde es el final del nombre del método y nunca
 * el número. El texto completo queda en `title`.
 *
 * MUESTRA PORCENTAJE SOLO CUANDO ES EXACTO. Si el descuento sale de una promo
 * de monto fijo, no hay porcentaje que dé la cuenta al peso y el badge dice la
 * plata: "$2.000 OFF". Ver `DescuentoPorMetodo.porcentaje`.
 */
function BadgeDescuento({
  descuento,
}: Readonly<{ descuento: DescuentoPorMetodo }>) {
  const ahorro =
    descuento.porcentaje !== null
      ? `${descuento.porcentaje}% OFF`
      : `$${descuento.ahorro.toLocaleString("es-AR")} OFF`;

  const texto = `${ahorro} ${descuento.metodo}`;

  return (
    <span
      title={texto}
      className="min-w-0 truncate rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-success"
    >
      {texto}
    </span>
  );
}
