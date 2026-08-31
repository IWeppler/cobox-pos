/**
 * El texto listo para comparar en una búsqueda.
 *
 * Minúsculas y SIN acentos: "camion" tiene que encontrar "Camión". Nadie
 * escribe la tilde con la clienta esperando, y menos en el teclado del
 * celular.
 *
 * Vive acá, compartido, porque hasta ahora existía una sola copia dentro de la
 * paleta de comandos y el buscador del catálogo comparaba crudo. Eso daba dos
 * buscadores de la MISMA app con dos comportamientos: `Ctrl+K` encontraba
 * "Camión" escribiendo "camion" y el buscador del POS no. Una diferencia así
 * no se lee como un detalle técnico desde el mostrador, se lee como que el
 * producto no está.
 *
 * `NFD` separa cada letra de su tilde y el rango `̀-ͯ` borra las
 * tildes sueltas. Eso alcanza también a la Ñ, que en NFD es "n" + tilde: o sea
 * que "panuelos" encuentra "Pañuelos" y "nina" encuentra "Niña". Es
 * lingüísticamente incorrecto —la ñ es una letra, no una n con adorno— y para
 * BUSCAR es lo que conviene: la alternativa es que quien escribe rápido no
 * encuentre el producto. El precio es que "año" y "ano" pasan a ser lo mismo,
 * y en un catálogo de productos eso no confunde a nadie.
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
