/**
 * La sesión vencida durante un Server Action.
 *
 * EL PROBLEMA QUE RESUELVE. Cuando el middleware no encuentra sesión, redirige
 * a `/auth`. Para una navegación está bien. Para un SERVER ACTION es una
 * trampa: el `fetch` que hace React sigue el 307 solo, recibe el HTML del
 * login, y como no es `text/x-component` tira
 *
 *   "An unexpected response was received from the server."
 *
 * Eso llega al error boundary como un crash cualquiera: la vendedora ve
 * "Esta pantalla falló, quedó registrado para revisarlo" —que no dice lo
 * único que importa— y un botón Reintentar que no puede funcionar, porque la
 * sesión sigue vencida y el intento siguiente termina igual. Visto en
 * producción, iPhone con la PWA instalada, /stock.
 *
 * LA SALIDA. Next usa el CUERPO de la respuesta como mensaje de error cuando
 * el status es >= 400 y el `content-type` es `text/plain` (ver
 * `server-action-reducer` en next/dist). Así que el middleware responde 401 +
 * texto plano con este marcador, y el boundary lo reconoce y ofrece lo único
 * que sirve: volver a entrar.
 *
 * El marcador viaja al principio del mensaje y no en un header porque es lo
 * único que cruza: React descarta la respuesta entera y solo conserva el
 * texto.
 */
export const MARCADOR_SESION_VENCIDA = "SESION_VENCIDA";

export const MENSAJE_SESION_VENCIDA =
  `${MARCADOR_SESION_VENCIDA}: la sesión venció. Volvé a entrar para seguir.`;

export function esSesionVencida(error: unknown): boolean {
  const mensaje =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return mensaje.includes(MARCADOR_SESION_VENCIDA);
}

/**
 * La respuesta genérica de Next cuando el server contestó algo que no es RSC.
 * No es un mensaje nuestro: es el texto exacto que arma
 * `server-action-reducer` cuando el `content-type` no es `text/x-component`.
 * Se reconoce para poder decir algo más útil que "esta pantalla falló", porque
 * el 100% de las veces significa lo mismo: la respuesta al action no llegó
 * entera (sesión, red, o el servidor devolvió una página de error).
 */
const RESPUESTA_INESPERADA = "An unexpected response was received from the server";

export function esRespuestaNoRsc(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : "";
  return mensaje.includes(RESPUESTA_INESPERADA);
}
