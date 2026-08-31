"use client";

import { useSyncExternalStore } from "react";

function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/**
 * ¿Hay conexión?
 *
 * `navigator.onLine` miente en un sentido y no en el otro: `false` es
 * confiable —no hay interfaz de red—, pero `true` solo dice que hay wifi
 * enganchado, no que ese wifi llegue a internet. Sirve para AVISAR ("estás sin
 * señal"), nunca para decidir si vale la pena intentar: eso lo resuelve el
 * intento real, y por eso ninguna escritura de la app pregunta esto antes de
 * mandar.
 *
 * En el server devuelve `true`: el HTML se arma en Ohio, donde la pregunta no
 * significa nada, y arrancar en "sin conexión" haría parpadear el aviso en
 * cada carga.
 */
export function useHayConexion(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true,
  );
}
