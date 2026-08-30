import { RUBRO_DEFAULT, type Rubro } from "@/entities/config/types";

/**
 * Rubros donde el POS ofrece RESERVAR en vez de cobrar.
 *
 * Solo indumentaria, y no es una restricción arbitraria: reservar es apartar
 * una unidad física puntual —`reservas` tiene una fila por unidad, sin columna
 * `cantidad`— para una clienta que la va a venir a buscar. Eso tiene sentido
 * cuando lo que se aparta es ESE talle de ESE color, que si se vende no vuelve
 * hasta la próxima temporada.
 *
 * En un kiosco o un almacén no existe: nadie reserva una gaseosa, y apartar
 * una unidad de un producto que se repone todas las semanas es sacarla del
 * stock vendible por nada. En electro tampoco, aunque suene parecido: ahí la
 * unidad se aparta con seña, que es plata que entra y hoy se hace por cuenta
 * corriente — una reserva sin pago es la peor versión de eso, porque bloquea
 * un aparato caro sin dejar registro de plata.
 *
 * Un rubro sin declarar cae en `RUBRO_DEFAULT` (indumentaria), igual que el
 * resto de la app: es el default de la base y el de los 5 negocios vivos que
 * son de ropa. Acá el lado seguro es MOSTRAR — esconder el modo en un comercio
 * de indumentaria por una config que no llegó le saca una función que usa.
 */
export function rubroUsaReservas(rubro?: Rubro): boolean {
  return (rubro ?? RUBRO_DEFAULT) === "indumentaria";
}
