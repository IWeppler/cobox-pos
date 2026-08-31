import { registrarVentaAction } from "@/features/sales/actions/create-sale";
import { esErrorDeRed } from "@/shared/lib/error-de-red";
import {
  marcarIntentoFallido,
  quitarVentaPendiente,
  ventasPendientes,
  type VentaPendiente,
} from "./outbox-ventas";

export type ResultadoSincronizacion = {
  subidas: number;
  /** Quedaron para más tarde: no había señal o el server no contestó. */
  pendientes: number;
  /** El server las RECHAZÓ por una razón de negocio. No se van a arreglar
   * solas y alguien las tiene que mirar. */
  rechazadas: { ventaId: string; error: string }[];
};

/**
 * Sube las ventas cobradas sin señal.
 *
 * DE A UNA Y EN ORDEN. Nada de `Promise.all`: cada venta descuenta stock y
 * mueve caja, y mandarlas juntas contra una conexión mala multiplica los
 * timeouts justo cuando la conexión ya está frágil. El orden es el de cobro.
 *
 * DOS TIPOS DE FALLA, QUE NO SE MEZCLAN:
 *
 * - Sin red / el server no contestó: la venta se queda en la cola y se
 *   reintenta. Es lo normal y no se le avisa a nadie.
 * - El server la rechazó (sin stock, caja cerrada, precio inválido): la venta
 *   se queda en la cola PERO marcada, porque reintentar no la va a arreglar.
 *   Esto tiene que llegar a una persona.
 *
 * Nunca se borra una venta de la cola por un error. La única razón para
 * sacarla es que el server confirme que quedó registrada.
 */
export async function sincronizarVentas(
  negocioId: string,
): Promise<ResultadoSincronizacion> {
  const cola = await ventasPendientes(negocioId);
  const resultado: ResultadoSincronizacion = {
    subidas: 0,
    pendientes: 0,
    rechazadas: [],
  };

  for (const venta of cola) {
    // Si la señal se cortó a mitad de la cola, no tiene sentido seguir
    // golpeando: las que quedan se suben en la próxima vuelta.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      resultado.pendientes += cola.length - resultado.subidas;
      break;
    }

    const salida = await subirUna(venta);

    if (salida.estado === "subida") {
      await quitarVentaPendiente(venta.ventaId);
      resultado.subidas += 1;
      continue;
    }

    if (salida.estado === "rechazada") {
      await marcarIntentoFallido(venta.ventaId, salida.error);
      resultado.rechazadas.push({
        ventaId: venta.ventaId,
        error: salida.error,
      });
      continue;
    }

    resultado.pendientes += 1;
  }

  return resultado;
}

type SalidaVenta =
  | { estado: "subida" }
  | { estado: "sin-red" }
  | { estado: "rechazada"; error: string };

async function subirUna(venta: VentaPendiente): Promise<SalidaVenta> {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(venta.campos)) {
    formData.append(clave, valor);
  }

  try {
    const resultado = await registrarVentaAction(
      { error: null, success: false },
      formData,
    );

    // `success` incluye el caso `yaRegistrada`: la venta está en la base, que
    // es lo único que decide si se saca de la cola.
    if (resultado.success) return { estado: "subida" };

    return {
      estado: "rechazada",
      error: resultado.error ?? "El servidor rechazó la venta.",
    };
  } catch (error) {
    // Una excepción acá es la red, no una regla de negocio: la action devuelve
    // los rechazos como valor. Se reintenta.
    if (esErrorDeRed(error)) return { estado: "sin-red" };

    console.error("[VENTA OFFLINE] Falla inesperada al sincronizar", {
      ventaId: venta.ventaId,
      error,
    });
    return { estado: "sin-red" };
  }
}
