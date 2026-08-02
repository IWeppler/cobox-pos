/**
 * Rubros que puede elegir un comercio al pedir el alta.
 *
 * Vive acá y no en la server action porque un archivo "use server" sólo debe
 * exportar funciones async: la lista la consume un componente cliente.
 *
 * OJO: no es lo mismo que `configuracion_pos.rubro` ('indumentaria' | 'electro'),
 * que decide cómo se muestra la identidad del producto en el POS. Esto es
 * comercial: de qué rubro dice ser quien pide el alta.
 */
export const RUBROS = [
  { valor: "quiosco", etiqueta: "Quiosco" },
  { valor: "minimercado", etiqueta: "Minimercado" },
  { valor: "ferreteria", etiqueta: "Ferretería" },
  { valor: "carniceria", etiqueta: "Carnicería" },
  { valor: "indumentaria", etiqueta: "Indumentaria" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export type RubroSolicitud = (typeof RUBROS)[number]["valor"];

export function etiquetaRubro(valor: string, rubroOtro?: string | null) {
  if (valor === "otro") return rubroOtro?.trim() || "Otro";
  return RUBROS.find((r) => r.valor === valor)?.etiqueta ?? valor;
}
