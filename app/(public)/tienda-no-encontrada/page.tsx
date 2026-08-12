import { notFound } from "next/navigation";

/**
 * Destino del rewrite cuando el subdominio no corresponde a ningún negocio
 * activo. Llama a `notFound()` en vez de renderizar el mensaje directamente
 * porque lo que importa además del texto es el STATUS: una tienda que no existe
 * tiene que responder 404, no un 200 con cara de error. Un rewrite conserva el
 * status de la página que se sirve, así que el 404 lo tiene que poner la página.
 */
export default function TiendaNoEncontrada() {
  notFound();
}
