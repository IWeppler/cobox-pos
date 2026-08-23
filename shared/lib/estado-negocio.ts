export type EstadoNegocio = "activo" | "prueba" | "suspendido" | "cancelado";

/**
 * Los estados que dejan al comercio TRABAJAR.
 *
 * `prueba` habilita igual que `activo`: durante los 14 días el comercio es un
 * cliente potencial usando el producto de verdad. Si no entrara acá, su
 * catálogo público daría 404 y el dueño no podría ni abrir su propio panel —
 * o sea que la prueba no se podría probar.
 *
 * Lo que separa a los dos NO es el acceso sino el cobro: `prueba` es "todavía
 * no pagó nunca". Cuando entra el primer pago pasa a `activo`.
 *
 * El corte por FECHA es otro eje y vive en `plan_vencimiento`: una prueba
 * vencida sigue siendo `prueba`, con su vencimiento en el pasado. Mezclar los
 * dos ejes en una sola columna es lo que hacía que "está en prueba" hubiera que
 * deducirlo de si el vencimiento caía cerca del alta.
 *
 * Esta lista tiene un espejo en la base: el CHECK de `negocios.estado`, la
 * policy `negocios_select_anon_activo` y `security.negocio_publico()`. Si acá
 * se agrega un estado, va también allá — si no, el código lo deja pasar y la
 * RLS lo frena, que es el peor de los dos mundos porque no da error.
 */
export const ESTADOS_HABILITADOS: readonly EstadoNegocio[] = [
  "activo",
  "prueba",
] as const;

export function negocioHabilitado(
  estado: string | null | undefined,
): boolean {
  return ESTADOS_HABILITADOS.includes(estado as EstadoNegocio);
}

/** Cómo se llama cada estado en pantalla. */
export const ETIQUETA_ESTADO: Record<string, string> = {
  activo: "activo",
  prueba: "prueba",
  suspendido: "suspendido",
  cancelado: "cancelado",
  baja: "baja",
};
