/**
 * Qué formatos de imagen se aceptan al subir.
 *
 * Existe como constante porque la lista estaba copiada en cuatro pantallas
 * (banner, portada de categoría, logo del comercio y fotos de producto) y ya
 * había divergido de lo que la base acepta: los buckets `productos` y `logos`
 * tienen `allowed_mime_types` en NULL, o sea que Storage no rechaza ninguno —
 * el único filtro es este `accept`, y estaba desactualizado.
 *
 * AVIF entra porque es lo que exporta hoy cualquier herramienta de diseño y
 * cualquier celular moderno: dejarlo afuera no protege de nada, solo obliga a
 * convertir el archivo a mano antes de subirlo. El transformador de Supabase lo
 * lee sin problema, y el optimizador del navegador (`image-optimizer.ts`) lo
 * decodifica por canvas como cualquier otro formato que el browser sepa abrir.
 *
 * NO está `image/*`: un `accept` abierto deja elegir un HEIC o un TIFF que el
 * canvas no decodifica, y el error aparece recién después de esperar la subida.
 */
export const FORMATOS_IMAGEN_ACEPTADOS =
  "image/png, image/jpeg, image/webp, image/avif";
