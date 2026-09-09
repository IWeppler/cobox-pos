"use client";

import { Label } from "@/shared/ui/label";
import { useListasPrecios } from "@/shared/hooks/use-listas-precios";

/**
 * Con qué lista de precios se le vende a este cliente.
 *
 * NO SE DIBUJA SI EL COMERCIO NO TIENE LISTAS, que son 7 de los 8: una ficha
 * de cliente con un campo que solo ofrece "Precio base" es un campo que enseña
 * a ignorar campos.
 *
 * Es una SUGERENCIA. El POS la propone al elegir al cliente y la vendedora
 * puede cambiarla en el ticket; lo que se cobró queda congelado en la venta.
 * Por eso la ayuda de abajo lo dice con esas palabras: si la ficha prometiera
 * "siempre le cobra mayorista", la primera venta que no lo haga se lee como un
 * bug.
 *
 * El `<select>` es nativo a propósito y no el `Select` de Radix: este
 * formulario se manda con `FormData` y el componente de Radix no aporta un
 * campo al form sin un input espejo. Un input escondido más es una cosa más
 * que se puede desincronizar.
 */
export function SelectorListaCliente({
  listaPrecioId,
}: Readonly<{ listaPrecioId?: string | null }>) {
  const { listas } = useListasPrecios();

  if (listas.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Centinela: le dice a la action que este formulario SÍ trae el campo.
          Sin él, guardar desde una pantalla sin selector borraría la lista. */}
      <input type="hidden" name="lista_precio_editable" value="1" />

      <Label htmlFor="edit-lista-precio" className="text-sm font-medium">
        Lista de precios
      </Label>
      <select
        id="edit-lista-precio"
        name="lista_precio_id"
        defaultValue={listaPrecioId ?? ""}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {/* "" es NULL en la base: no hay una fila "Minorista". */}
        <option value="">Precio base (el de siempre)</option>
        {listas.map((lista) => (
          <option key={lista.id} value={lista.id}>
            {lista.nombre}
          </option>
        ))}
      </select>
      <p className="text-[10px] leading-tight text-muted-foreground">
        El POS la propone al elegir a este cliente y la vendedora la puede
        cambiar en el ticket. Cada venta guarda con cuál se cobró.
      </p>
    </div>
  );
}
