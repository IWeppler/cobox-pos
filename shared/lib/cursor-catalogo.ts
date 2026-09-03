/**
 * El cursor de la sincronización incremental: hasta qué momento el cliente ya
 * tiene el catálogo.
 *
 * VIVE ACÁ Y NO EN LA ACTION porque los dos caminos que lo emiten tienen que
 * calcularlo IGUAL: el catálogo completo (`catalogo-panel.ts`) siembra el
 * primer cursor y el delta (`catalogo-delta.ts`) lo va moviendo. Si el
 * completo devolviera un cursor sin solapamiento, la PRIMERA sincronización
 * incremental de cada dispositivo se saltearía las escrituras en vuelo — el
 * agujero más difícil de ver de todos, porque solo pasa una vez por celular.
 *
 * Además un archivo `"use server"` no puede exportar una constante.
 */

/**
 * Cuánto se re-pide de más en cada sincronización.
 *
 * Con un cursor exacto se pierden filas, y no por un error de programación
 * sino por cómo funcionan las transacciones: una escritura que arrancó ANTES
 * de la consulta pero commitea DESPUÉS tiene un `updated_at` anterior al corte
 * y sin embargo no la vemos (no está en nuestro snapshot). En la próxima
 * sincronización su timestamp ya quedó atrás del cursor y no vuelve a aparecer
 * NUNCA.
 *
 * La defensa es pedir de más: se re-traen unos segundos que ya se tenían. Es
 * gratis porque el merge del cliente es un upsert por id —aplicar dos veces la
 * misma fila da lo mismo— y convierte un dato perdido para siempre en unas
 * filas repetidas.
 *
 * 60 segundos es holgado: cubre cualquier transacción de escritura de esta app
 * (la más larga es `aprobar_orden_compra`, que corre en batch) con dos órdenes
 * de magnitud de sobra.
 */
export const SOLAPAMIENTO_SEG = 60;

/**
 * El cursor que se le devuelve al cliente, SIEMPRE calculado en el servidor.
 *
 * Nunca `Date.now()` del navegador: el reloj del celular de una vendedora
 * puede estar corrido minutos, y un cursor adelantado se saltea cambios en
 * silencio y para siempre. El cliente guarda lo que le devuelve el servidor y
 * lo manda de vuelta tal cual, sin mirarlo.
 *
 * Se toma ANTES de leer, no después: lo que se escriba mientras corren las
 * consultas tiene que caer del lado de "todavía no lo tengo".
 */
export function calcularCursor(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - SOLAPAMIENTO_SEG * 1000).toISOString();
}
