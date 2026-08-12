/**
 * Límites de imágenes de producto, compartidos entre cliente y servidor.
 *
 * Viven en su propio módulo, separados de image-optimizer.ts, porque ese
 * importa `browser-image-compression` — una librería de navegador que no
 * tiene por qué terminar en el bundle de una Server Action solo para leer un
 * número. El optimizador los re-exporta para que el cliente los siga
 * importando de un solo lugar.
 */

/** Tope de imágenes por producto.
 *
 * NO es retroactivo: hay productos viejos con 4 y 5 fotos y siguen mostrando
 * todas. El tope aplica al momento de AGREGAR — si un producto ya está por
 * encima, no se le pueden sumar más, pero tampoco se le borra ninguna. */
export const MAX_IMAGENES_PRODUCTO = 3;

/** Tope por archivo ANTES de comprimir.
 *
 * OJO: esto NO tiene que ver con lo que se guarda — de eso se encarga el
 * optimizador, y lo que llega a Storage siempre está comprimido (ver
 * MAX_BYTES_GUARDADOS). Este límite es sobre el ORIGINAL, y el motivo es
 * memoria del navegador: para comprimir hay que decodificar la imagen entera
 * a un bitmap en RAM, y ese bitmap depende de los PÍXELES, no del peso del
 * archivo. Una foto de 12MP ocupa ~48MB decodificada venga en 2MB o en 8MB.
 *
 * El peso en bytes es un proxy imperfecto pero barato de los píxeles: no hay
 * forma de saber las dimensiones sin decodificar, que es justamente lo que
 * queremos evitar. 25MB deja pasar cualquier foto de celular o de reflex y
 * frena panorámicas y escaneos gigantes, que son los que revientan la
 * pestaña. */
export const MAX_BYTES_POR_IMAGEN = 25 * 1024 * 1024;

/** Tope de lo que se acepta GUARDAR en Storage, ya comprimido.
 *
 * El optimizador apunta a 0.2MB para el main, 0.1 para el grid y 0.03 para el
 * thumbnail, pero `maxSizeMB` de browser-image-compression es un objetivo, no
 * un tope duro: puede pasarse. Este es el freno real, y va del lado del
 * servidor, siguiendo el mismo criterio que el resto del sistema — nunca
 * confiar en que el cliente ya validó. 2MB es holgado a propósito: no busca
 * afinar el tamaño, busca que NUNCA entre un original sin comprimir. */
export const MAX_BYTES_GUARDADOS = 2 * 1024 * 1024;

/** Tope para el MASTER, que a propósito es más alto que los demás.
 *
 * El master (1600px @0.9) existe para poder regenerar derivadas el día que se
 * quiera cambiar tamaños o códec. Apretarlo con el mismo tope que una derivada
 * sería sabotearlo: si se lo comprime hasta entrar en 2MB deja de ser un
 * master y pasa a ser otra copia degradada, que es exactamente el problema que
 * viene a resolver.
 *
 * 4MB igual frena un original crudo de celular (12MP ronda los 4-8MB), así que
 * el guard de "nunca entre un original sin procesar" se mantiene. */
export const MAX_BYTES_MASTER = 4 * 1024 * 1024;
