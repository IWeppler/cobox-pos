/**
 * POR QUÉ se anula una venta, que hasta ahora no se guardaba en ningún lado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA COLUMNA "MOTIVO" NO GUARDABA UN MOTIVO
 *
 * `ventas.motivo_anulacion` guarda `RESTAURAR_STOCK` o `BAJA`, que es el
 * DESTINO DE LA MERCADERÍA — a dónde va la prenda que volvió— y no la razón
 * por la que la venta se cayó. Son dos preguntas distintas y hasta ahora
 * compartían una columna, así que la segunda simplemente no tenía respuesta:
 * de las 26 anulaciones de Evens no se puede saber cuántas fueron un cambio de
 * talle, cuántas una prenda fallada y cuántas una venta mal cargada.
 *
 * Ahora son campos separados: `destino_mercaderia` y `motivo_codigo`.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ES UNA LISTA CERRADA, Y CORTA. Un campo de texto libre en el mostrador se
 * llena con "devolucion", "cambio", "x" y vacío, y no se puede contar. Cinco
 * opciones se eligen con el pulgar sin leer, y se agrupan.
 *
 * `ERROR_DE_CARGA` es la que hay que mirar. Es la que dice que la venta no
 * tuvo nada malo: alguien se equivocó cargándola y anular era la única
 * herramienta. Medido en Evens sobre 90 días, ese uso está: las anulaciones
 * tienen una re-venta del mismo producto dentro de la hora en el 41,7% de los
 * casos contra un 13,1% de base, y los 4 pares de total idéntico son todos
 * cambios de medio de pago. Con "Corregir el cobro" ya en la app, la
 * proporción de `ERROR_DE_CARGA` es la forma de saber si esa herramienta
 * reemplazó al martillo — y si no baja, es que falta otra corrección (el
 * cliente, los renglones) que todavía obliga a anular.
 *
 * El criterio vive acá y en el CHECK de `ventas.motivo_codigo`, y los dos
 * tienen que decir lo mismo. Mismo patrón que `tipo-egreso.ts` y
 * `temporada-categoria.ts`.
 */
export const MOTIVOS_ANULACION = [
  {
    codigo: "ERROR_DE_CARGA",
    label: "La venta se cargó mal",
    ayuda: "El medio de pago, la clienta o los productos estaban equivocados.",
  },
  {
    codigo: "CAMBIO",
    label: "Cambió por otra cosa",
    ayuda: "Se lleva otro talle, otro color u otro producto.",
  },
  {
    codigo: "ARREPENTIMIENTO",
    label: "Se arrepintió",
    ayuda: "Devolvió la mercadería y se le devolvió la plata.",
  },
  {
    codigo: "FALLADO",
    label: "El producto salió fallado",
    ayuda: "Volvió con una falla o roto.",
  },
  { codigo: "OTRO", label: "Otro motivo", ayuda: "Contalo en una línea." },
] as const;

export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number]["codigo"];

/**
 * Fail-closed, igual que `normalizarRubro` y `tipoEgresoValido`: un código que
 * este módulo no conoce NO se guarda. Que la columna quede en null es la
 * verdad ("no se sabe"); guardar un valor inventado ensucia la única medición
 * que justifica el campo.
 */
export function esMotivoAnulacion(valor: unknown): valor is MotivoAnulacion {
  return MOTIVOS_ANULACION.some((motivo) => motivo.codigo === valor);
}

export function normalizarMotivoAnulacion(
  valor: unknown,
): MotivoAnulacion | null {
  return esMotivoAnulacion(valor) ? valor : null;
}

/** El texto para mostrar. Un código que no está en la lista se muestra tal
 * cual en vez de desaparecer: si aparece en pantalla, alguien lo ve y lo
 * reporta; traducido a "—" no se entera nadie. */
export function etiquetaMotivoAnulacion(valor: string | null | undefined): string {
  if (!valor) return "Sin motivo registrado";
  return (
    MOTIVOS_ANULACION.find((motivo) => motivo.codigo === valor)?.label ?? valor
  );
}
