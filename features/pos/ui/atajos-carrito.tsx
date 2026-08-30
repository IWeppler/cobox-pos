"use client";

import { toast } from "sonner";
import { useAtajosTeclado } from "@/shared/hooks/use-atajos-teclado";

type AtajosCarritoProps = {
  /** En qué paso está el ticket: decide qué hace F4 y qué hace Esc. */
  paso: "CART" | "PAYMENT";
  hayItems: boolean;
  /** Con una venta en vuelo no se dispara nada: dos Ctrl+Enter seguidos son
   * dos ventas. */
  ocupado: boolean;
  irAPagar: () => void;
  volverAlCarrito: () => void;
  confirmar: () => void;
  abrirSelectorCliente: () => void;
  vaciarTicket: () => void;
  /** Suma o resta una unidad al ÚLTIMO renglón cargado. `null` cuando no hay
   * ninguno o cuando ese renglón se vende fraccionado (ver abajo). */
  ajustarUltimo: ((delta: number) => void) | null;
};

/**
 * Los atajos del ticket, en un componente propio y no en un `useAtajosTeclado`
 * dentro de CartPanelAdmin.
 *
 * El motivo es concreto: ese componente tiene un `if (!mounted) return null`
 * ANTES de definir sus handlers, así que un hook que los use no puede vivir
 * arriba de esa línea sin romper el orden de los hooks. Acá se monta después,
 * ya con todo resuelto, y no renderiza nada.
 *
 * Confirmar la venta NO tiene su propia lógica: llama al mismo handler que el
 * botón. Un atajo que arme la venta por su cuenta es un segundo camino a la
 * plata, y a la larga uno de los dos valida algo que el otro no.
 */
export function AtajosCarrito({
  paso,
  hayItems,
  ocupado,
  irAPagar,
  volverAlCarrito,
  confirmar,
  abrirSelectorCliente,
  vaciarTicket,
  ajustarUltimo,
}: Readonly<AtajosCarritoProps>) {
  useAtajosTeclado([
    {
      teclas: "alt+ArrowUp",
      activo: Boolean(ajustarUltimo) && !ocupado,
      correr: () => ajustarUltimo?.(1),
    },
    {
      teclas: "alt+ArrowDown",
      activo: Boolean(ajustarUltimo) && !ocupado,
      correr: () => ajustarUltimo?.(-1),
    },
    {
      teclas: "F4",
      activo: paso === "CART" && hayItems && !ocupado,
      correr: irAPagar,
    },
    {
      teclas: "F7",
      activo: hayItems && !ocupado,
      correr: abrirSelectorCliente,
    },
    {
      teclas: "ctrl+Enter",
      activo: paso === "PAYMENT" && hayItems && !ocupado,
      correr: confirmar,
    },
    {
      teclas: "Escape",
      activo: paso === "PAYMENT" && !ocupado,
      correr: volverAlCarrito,
    },
    {
      // Incómodo a propósito: es lo único destructivo de la lista, y encima
      // pide confirmar. Un ticket cargado a mano que se borra de una tecla es
      // la clienta esperando mientras se vuelve a cargar todo.
      teclas: "ctrl+shift+Backspace",
      activo: hayItems && !ocupado,
      correr: () => {
        toast.warning("¿Vaciar el ticket?", {
          description: "Se van a quitar todos los productos cargados.",
          action: {
            label: "Vaciar",
            onClick: vaciarTicket,
          },
        });
      },
    },
  ]);

  return null;
}
