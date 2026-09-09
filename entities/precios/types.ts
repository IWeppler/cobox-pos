import type { ListaDePrecios } from "@/shared/lib/precio-de-lista";

/**
 * Una fila de `listas_precios`, tal como la lee el panel.
 *
 * Extiende `ListaDePrecios` —el contrato mínimo que necesita el cálculo— en
 * vez de redeclararlo: así la misma fila que se edita en Configuración es la
 * que se le puede pasar a `precioDeLista` sin adaptar nada, y agregar un campo
 * al cálculo obliga al compilador a traerlo también acá.
 */
export interface ListaPrecio extends ListaDePrecios {
  id: string;
  nombre: string;
  tipo_regla: string;
  valor: number;
  admite_promociones: boolean;
  activa: boolean;
  creado_en?: string;
  /**
   * Cuántos productos tienen precio fijo en esta lista. NO es una columna: lo
   * cuenta la página. Va acá porque es lo que le dice a la dueña si la regla
   * gobierna su catálogo o si hay excepciones cargadas que la pisan.
   */
  overrides?: number;
}

/** Lo que el formulario manda y las actions esperan. */
export const TIPOS_REGLA_LISTA = ["PORCENTAJE", "MARKUP"] as const;
export type TipoReglaListaForm = (typeof TIPOS_REGLA_LISTA)[number];
