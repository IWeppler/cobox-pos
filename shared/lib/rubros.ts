import type { Rubro } from "@/entities/config/types";

/**
 * Rubro COMERCIAL: de qué dice ser el comercio que se da de alta.
 *
 * Vive acá y no en una server action porque un archivo "use server" sólo puede
 * exportar funciones async, y esta lista la consume un componente cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OJO, son DOS rubros distintos y confundirlos rompe cosas:
 *
 *   `rubro_comercial` (esto)      14 valores. Segmentación: para saber a quién
 *                                 le estás vendiendo. Se lee en /admincomerz.
 *
 *   `configuracion_pos.rubro`     2 valores, con CHECK en la base. OPERATIVO:
 *                                 decide cómo se muestra la identidad del
 *                                 producto en Inventario — indumentaria razona
 *                                 por talle/color ("N var."), electro por
 *                                 modelo + EAN.
 *
 * El operativo se DERIVA del comercial en el alta (ver `rubroOperativoDesde`)
 * y después queda editable en Configuración. Lo que contestó en el formulario
 * es un punto de partida, no una condena: una ferretería puede querer la
 * identidad de electro y tiene que poder cambiarla sin pelear.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const RUBROS = [
  { valor: "indumentaria", etiqueta: "Indumentaria y textil" },
  { valor: "cosmetica", etiqueta: "Cosmética y cuidado personal" },
  { valor: "suplementos", etiqueta: "Suplementos y nutrición" },
  { valor: "bazar", etiqueta: "Bazar y decoración del hogar" },
  { valor: "electronica", etiqueta: "Electrónica y tecnología" },
  { valor: "ferreteria", etiqueta: "Ferretería y materiales" },
  { valor: "libreria", etiqueta: "Librería y papelería" },
  { valor: "jugueteria", etiqueta: "Juguetería" },
  { valor: "farmacia", etiqueta: "Farmacia" },
  { valor: "gastronomia", etiqueta: "Gastronomía" },
  { valor: "panaderia", etiqueta: "Panadería y confitería" },
  { valor: "almacen", etiqueta: "Almacén y dietética" },
  { valor: "bebidas", etiqueta: "Bebidas" },
  { valor: "mascotas", etiqueta: "Mascotas" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export type RubroComercial = (typeof RUBROS)[number]["valor"];

export function etiquetaRubro(valor: string | null | undefined) {
  if (!valor) return "Sin rubro";
  return RUBROS.find((r) => r.valor === valor)?.etiqueta ?? valor;
}

/**
 * Rubros comerciales cuya mercadería se identifica por MODELO + código, no por
 * talle y color. Son los que arrancan en la vista `electro`.
 *
 * El criterio no es "qué vende" sino "cómo se distingue una unidad de otra":
 * dos celulares del mismo modelo se distinguen por IMEI, dos remeras del mismo
 * modelo por talle. Ferretería entra acá porque un tornillo se pide por medida
 * y código, no por color.
 */
const RUBROS_TIPO_ELECTRO = new Set<RubroComercial>([
  "electronica",
  "ferreteria",
]);

/** Traduce el rubro comercial al operativo. Fail-safe a indumentaria, que es
 * el comportamiento por defecto del POS. */
export function rubroOperativoDesde(
  rubroComercial: string | null | undefined,
): Rubro {
  return RUBROS_TIPO_ELECTRO.has(rubroComercial as RubroComercial)
    ? "electro"
    : "indumentaria";
}

/**
 * Cuánta gente trabaja en el comercio. Segmentación pura: no cambia ninguna
 * regla del sistema — los topes de usuarios los pone el plan, no esto.
 * Sirve para saber a qué tamaño de comercio le está sirviendo Comerz.
 */
export const TAMANOS_EQUIPO = [
  { valor: "solo_yo", etiqueta: "Solo yo" },
  { valor: "2_a_5", etiqueta: "2 a 5 personas" },
  { valor: "6_a_10", etiqueta: "6 a 10 personas" },
  { valor: "mas_de_10", etiqueta: "Más de 10 personas" },
] as const;

export type TamanoEquipo = (typeof TAMANOS_EQUIPO)[number]["valor"];

export function etiquetaTamanoEquipo(valor: string | null | undefined) {
  if (!valor) return "Sin dato";
  return TAMANOS_EQUIPO.find((t) => t.valor === valor)?.etiqueta ?? valor;
}

/** Condición frente al IVA del EMISOR. Espejo del CHECK de
 * `configuracion_pos.condicion_iva`; "Consumidor Final" queda afuera porque no
 * es una condición con la que un comercio emita. */
export const CONDICIONES_IVA = [
  { valor: "Monotributo", etiqueta: "Monotributista" },
  { valor: "Responsable Inscripto", etiqueta: "Responsable Inscripto" },
  { valor: "Exento", etiqueta: "Exento" },
] as const;
