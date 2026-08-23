/**
 * La clase que hace que dropdowns, selects y modales del panel se vean oscuros.
 *
 * EL PROBLEMA: el layout de /admincomerz fuerza el tema con `className="dark"`
 * en un `<div>`, y eso alcanza para todo lo que se renderiza adentro. Pero
 * dropdowns, selects y dialogs de Radix se montan en un PORTAL colgado de
 * `document.body` — o sea FUERA de ese div. Ahí los tokens de shadcn caen a su
 * versión clara y el menú sale blanco sobre un panel negro.
 *
 * POR QUÉ NO SE ARREGLA PONIENDO `dark` EN EL `<html>`: el layout raíz ya tiene
 * `ThemeProvider` de next-themes con `attribute="class"`, que administra esa
 * clase según el tema del usuario. Escribirla a mano desde acá es pelearse con
 * él: la próxima vez que sincronice puede borrarla, y el panel quedaría claro
 * de golpe. Esto en cambio no toca el tema global de nadie.
 *
 * AL AGREGAR UN PORTAL NUEVO EN ESTE PANEL: ponerle esta clase. Sin ella se ve
 * claro, y como el panel es de una sola persona nadie más lo va a reportar.
 */
export const CLASE_PORTAL_OSCURO = "dark";
