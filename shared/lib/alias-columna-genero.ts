/**
 * Cómo puede llamarse la columna de GÉNERO en una planilla, venga de donde
 * venga.
 *
 * Existe porque el género tiene un destino distinto al del resto de las
 * columnas: NO es un atributo de variante. Es a quién está destinada la
 * prenda, y en este sistema eso es el nivel de arriba del árbol de categorías
 * (HOMBRE › ZAPATILLAS, NENA › CALZADOS). Viaja como `raw_genero` hasta
 * `resolverCategoriaImport`, que cruza género (padre) con tipo de prenda
 * (hijo), y solo sobrevive como atributo en Ropa Bebé, donde sí es un eje de
 * variante real.
 *
 * Por qué es UNA lista compartida y no dos: los dos importadores la tenían
 * por separado y no decían lo mismo. `parse-productos-csv.ts` reconocía seis
 * formas y el remito de proveedor solo dos, así que una planilla con la
 * columna "SEXO" entraba por el remito como atributo libre y le agregaba
 * "SEXO: Mujer" a cada variante — exactamente lo que la migración
 * `20260904160000` tuvo que limpiar de 2.238 variantes de Evens y Estilo
 * Bonito. Un dato con una regla y dos listas es la regla aplicada a medias.
 *
 * Se comparan normalizadas (sin tildes, sin mayúsculas, sin espacios ni
 * guiones), así que alcanza con listar una forma de cada palabra.
 */
export const ALIAS_COLUMNA_GENERO = [
  "genero",
  "género",
  "sexo",
  "publico",
  "público",
  "audiencia",
] as const;
