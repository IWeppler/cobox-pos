"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  construirArbolCategorias,
  type ArbolCategorias,
  type CategoriaBase,
} from "@/shared/utils/category-tree";

/**
 * Selector de categoría en DOS pasos: padre → subcategoría.
 *
 * Por qué no una lista plana "Padre › Hijo": Evens tiene 50 categorías activas
 * y Estilo Bonito 48, o sea 50 opciones en un solo desplegable, y en un remito
 * de 94 grupos eso es 94 veces scrollear la misma lista larga con el dedo.
 * Peor: el árbol repite nombres entre audiencias —Evens tiene "Camperas" bajo
 * MUJER y bajo NIÑOS—, así que la lista plana obliga a leer el prefijo entero
 * de cada opción para distinguirlas.
 *
 * Con dos pasos, el select 1 tiene 7 opciones en Evens (5 padres + 2 sueltas)
 * y el 2 nunca pasa de 12 (el más grande es "Ropa Bebe" de Estilo Bonito). El
 * mismo patrón que ya usan "Mover" en masa de /stock y los chips del catálogo
 * público.
 *
 * `value` / `onChange` son el categoria_id FINAL: el que consume esto no se
 * entera de que son dos selects.
 *
 * Vivía adentro de merge-table.tsx. Se movió acá cuando la carga inicial —la
 * otra pantalla de la MISMA conciliación— necesitó lo mismo: dos selectores de
 * categoría con distinta forma en el mismo flujo es justo lo que hace que uno
 * de los dos se quede sin los arreglos del otro.
 */

/**
 * Deriva el padre (o la propia categoría, si es raíz o suelta) a partir de un
 * categoria_id ya resuelto — para precargar el select 1 cuando el valor final
 * ya se conoce (sugerencia del import, override previo, borrador).
 */
export function derivarSeleccionCategoria(
  categoriaId: string | null | undefined,
  categoriasFlat: CategoriaBase[],
): { padreId: string; categoriaId: string } {
  if (!categoriaId) return { padreId: "", categoriaId: "" };
  const categoria = categoriasFlat.find((c) => c.id === categoriaId);
  if (!categoria) return { padreId: "", categoriaId: "" };
  return {
    padreId: categoria.parent_id ?? categoria.id,
    categoriaId: categoria.id,
  };
}

/**
 * El árbol para ELEGIR, no para filtrar: cada categoría existe siempre.
 *
 * `construirArbolCategorias` descarta lo que tiene conteo cero porque nació
 * para el filtro de /stock, donde un chip vacío es ruido. Acá una categoría
 * sin productos es exactamente la que hay que poder elegir — si no, la
 * categoría recién creada no aparece en el remito que la motivó.
 */
export function arbolParaElegir(categorias: CategoriaBase[]): ArbolCategorias {
  const countsUno = Object.fromEntries(categorias.map((c) => [c.id, 1]));
  return construirArbolCategorias(categorias, countsUno);
}

/** Igual que `arbolParaElegir`, memoizado — es lo que quieren los callers. */
export function useArbolParaElegir(categorias: CategoriaBase[]) {
  return useMemo(() => arbolParaElegir(categorias), [categorias]);
}

export function CategoriaPadreHijoSelect({
  arbol,
  categoriasFlat,
  value,
  onChange,
  disabled,
  triggerClassName = "w-full",
  size,
  placeholderPadre = "Categoría",
}: Readonly<{
  arbol: ArbolCategorias;
  categoriasFlat: CategoriaBase[];
  value: string;
  onChange: (categoriaId: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
  size?: "sm" | "default";
  /** Qué dice el select 1 sin elegir. La carga inicial lo usa para avisar que
   * si no se toca nada se va a CREAR una categoría. */
  placeholderPadre?: string;
}>) {
  const [padreId, setPadreId] = useState(
    () => derivarSeleccionCategoria(value, categoriasFlat).padreId,
  );

  /**
   * Si `value` cambia DESDE AFUERA (precarga del modal, override de otro lado,
   * reset después de aplicar en lote), hay que resincronizar el padre: si no,
   * el select 2 sigue mostrando los hijos del padre anterior. Lo mismo cuando
   * las categorías terminan de cargar — hasta ese momento el id no se puede
   * resolver a un padre.
   *
   * Va en el render y no en un `useEffect` porque un efecto que llama a
   * setState provoca un segundo render con el select 2 ya dibujado y vacío,
   * que es visible en una tabla de 94 filas. El seguimiento del valor anterior
   * es el patrón de "ajustar estado cuando cambian las props".
   */
  const [visto, setVisto] = useState({ value, categoriasFlat });
  if (visto.value !== value || visto.categoriasFlat !== categoriasFlat) {
    setVisto({ value, categoriasFlat });
    setPadreId(derivarSeleccionCategoria(value, categoriasFlat).padreId);
  }

  const padreSeleccionado = arbol.padres.find((p) => p.id === padreId) ?? null;

  const handlePadreChange = (val: string) => {
    const esPadreConHijos = arbol.padres.some(
      (p) => p.id === val && p.hijos.length > 0,
    );
    // Padre sin hijos (o categoría suelta): el destino final ya se conoce con
    // este solo click. Padre con hijos: esperamos el select 2.
    const nuevoValue = esPadreConHijos ? "" : val;
    setPadreId(val);
    // El value que estamos por emitir queda marcado como "ya visto": si no, la
    // sincronización de arriba lo leería como un cambio externo y borraría el
    // padre recién elegido, y el select 2 no llegaría a aparecer nunca.
    setVisto({ value: nuevoValue, categoriasFlat });
    onChange(nuevoValue);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        value={padreId}
        onValueChange={handlePadreChange}
        disabled={disabled}
      >
        <SelectTrigger size={size} className={triggerClassName}>
          <SelectValue placeholder={placeholderPadre} />
        </SelectTrigger>
        <SelectContent>
          {arbol.padres.map((padre) => (
            <SelectItem key={padre.id} value={padre.id}>
              {padre.nombre}
            </SelectItem>
          ))}
          {arbol.sinPadre.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {padreSeleccionado && padreSeleccionado.hijos.length > 0 && (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger size={size} className={triggerClassName}>
            <SelectValue placeholder="Subcategoría" />
          </SelectTrigger>
          <SelectContent>
            {padreSeleccionado.hijos.map((hijo) => (
              <SelectItem key={hijo.id} value={hijo.id}>
                {hijo.nombre}
              </SelectItem>
            ))}
            <SelectItem value={padreSeleccionado.id}>
              Todo {padreSeleccionado.nombre}, sin subcategoría específica
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
