import { normalizarParaComparar } from "./parse-variant-attributes";

// Progresión conocida de talles por letra, incluyendo las equivalencias
// argentinas (G≈L, GG≈XL) y las variantes de escritura más comunes para
// 2XL/3XL (XXL/XXXL) — mismo rango, no se fusiona el dato, solo el orden.
const PROGRESION_TALLE_LETRA: Record<string, number> = {
  xxs: 0,
  xs: 1,
  s: 2,
  m: 3,
  l: 4,
  g: 4,
  xl: 5,
  gg: 5,
  "2xl": 6,
  xxl: 6,
  "3xl": 7,
  xxxl: 7,
  "4xl": 8,
  "5xl": 9,
  "6xl": 10,
  "7xl": 11,
  "8xl": 12,
};

type GrupoTalle = "numerico" | "letra" | "otro";

const ORDEN_GRUPO: Record<GrupoTalle, number> = {
  numerico: 0,
  letra: 1,
  otro: 2,
};

function clasificarTalle(valorNormalizado: string): GrupoTalle {
  if (/^\d+$/.test(valorNormalizado)) return "numerico";
  if (valorNormalizado in PROGRESION_TALLE_LETRA) return "letra";
  return "otro";
}

/**
 * Comparador de orden para valores de Talle (usable en cualquier .sort()).
 * Normaliza case/tildes antes de comparar (no fusiona el dato, solo el
 * orden). Tres grupos, sin intercalar: numéricos (36, 38...) ascendente,
 * después talles por letra según la progresión XS..8XL (con equivalencias
 * G=L, GG=XL, XXL=2XL, XXXL=3XL), y por último cualquier valor no
 * reconocido ("Adulto", "Tu", "U"...), alfabético entre sí.
 */
export function compararTalles(a: string, b: string): number {
  const normA = normalizarParaComparar(a);
  const normB = normalizarParaComparar(b);

  const grupoA = clasificarTalle(normA);
  const grupoB = clasificarTalle(normB);

  if (grupoA !== grupoB) return ORDEN_GRUPO[grupoA] - ORDEN_GRUPO[grupoB];

  if (grupoA === "numerico") return Number(normA) - Number(normB);
  if (grupoA === "letra") {
    return PROGRESION_TALLE_LETRA[normA] - PROGRESION_TALLE_LETRA[normB];
  }
  return a.localeCompare(b, "es");
}
