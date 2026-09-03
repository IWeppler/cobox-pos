"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { MetodoPago } from "@/entities/payments/types";

/**
 * Corregir el método de pago de una venta ya registrada.
 *
 * Es la alternativa barata a lo que hoy se hace a mano: anular la venta entera
 * y volver a cargarla. Ese camino mueve el stock dos veces, saca la plata de la
 * caja y la vuelve a meter, y —en Evens— necesita a la dueña, porque anular
 * pide `ventas.anular` y las vendedoras no lo tienen. Ver el encabezado de
 * `20260903130000_corregir_metodo_pago_venta.sql` para los números que lo
 * motivan.
 *
 * TODA la validación vive en la RPC, y no por prolijidad: un server action es
 * un endpoint, así que chequear acá "el turno está abierto" y confiar sería
 * dejar la puerta al lado abierta. Esta función traduce códigos de error a
 * frases que se pueden leer en el mostrador y no decide nada.
 */

/** Los códigos que lanza la RPC, con lo que significan para quien está
 * atendiendo. El default no inventa una explicación: dice que no se pudo. */
const MENSAJES: Record<string, string> = {
  SIN_PERMISO: "No tenés permiso para corregir el cobro de una venta.",
  VENTA_INEXISTENTE: "No se encontró la venta.",
  VENTA_AJENA: "Esta venta la cargó otra persona: solo puede corregirla ella o una administradora.",
  VENTA_NO_CORREGIBLE: "La venta está anulada: no se puede corregir el cobro.",
  VENTA_CON_DEUDA:
    "Esta venta quedó con deuda en cuenta corriente. Cambiar ese cobro toca el saldo del cliente, así que todavía hay que anularla y volver a cargarla.",
  VENTA_SIN_UN_UNICO_COBRO:
    "Esta venta se cobró con más de un método. Para cambiarlos hay que anularla y volver a cargarla.",
  COBRO_NO_CONFIRMADO: "El cobro de esta venta no está confirmado.",
  TURNO_CERRADO:
    "El turno de caja de esta venta ya se cerró. Corregir el cobro ahora movería un arqueo que ya se cuadró: hay que anular la venta y volver a cargarla.",
  METODO_INEXISTENTE: "Ese método de pago no existe o está desactivado.",
  MISMO_METODO: "La venta ya está cobrada con ese método.",
  SIN_NEGOCIO_ACTIVO: "No hay un comercio activo en esta sesión.",
};

export interface CorreccionMetodoPago {
  metodoAnterior: string;
  metodoNuevo: string;
  totalAnterior: number;
  totalNuevo: number;
  /** Positiva: el cliente pagó de menos. Negativa: pagó de más. */
  diferenciaTotal: number;
}

export async function corregirMetodoPagoAction(
  ventaId: string,
  metodoPagoId: string,
  motivo?: string,
): Promise<{
  data: CorreccionMetodoPago | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase.rpc("corregir_metodo_pago_venta", {
      p_venta_id: ventaId,
      p_metodo_pago_id: metodoPagoId,
      p_motivo: motivo?.trim() || null,
    });

    if (error || !data) {
      const codigo = Object.keys(MENSAJES).find((clave) =>
        error?.message?.includes(clave),
      );

      console.error("[CORRECCION PAGO] No se pudo corregir:", {
        ventaId,
        metodoPagoId,
        error,
      });

      return {
        data: null,
        error: codigo
          ? MENSAJES[codigo]
          : "No se pudo corregir el cobro de esta venta.",
      };
    }

    const resultado = data as {
      metodo_anterior: string;
      metodo_nuevo: string;
      total_anterior: number;
      total_nuevo: number;
      diferencia_total: number;
    };

    // Las mismas rutas que revalida la anulación: la corrección cambia el
    // arqueo del turno, el desglose por método y —cuando los recargos difieren—
    // el total de la venta, así que toca lo mismo que mueve una anulación.
    revalidatePath("/");
    revalidatePath("/ventas");
    revalidatePath("/caja");
    revalidatePath("/reportes");

    return {
      data: {
        metodoAnterior: resultado.metodo_anterior,
        metodoNuevo: resultado.metodo_nuevo,
        totalAnterior: Number(resultado.total_anterior),
        totalNuevo: Number(resultado.total_nuevo),
        diferenciaTotal: Number(resultado.diferencia_total),
      },
      error: null,
    };
  } catch (err) {
    console.error("[CORRECCION PAGO] Error inesperado:", err);
    return {
      data: null,
      error: "Ocurrió un error inesperado al corregir el cobro.",
    };
  }
}

/**
 * Los métodos entre los que se puede corregir.
 *
 * Solo los ACTIVOS, y con `recargo_porcentaje` porque el modal muestra cuánto
 * cambia el total ANTES de confirmar, con la misma función que usa el server
 * (`calcularRecargoMonto`). Que el número de la pantalla y el que se persiste
 * salgan de la misma cuenta es lo que evita que la vendedora acepte una
 * diferencia y se aplique otra.
 *
 * `comision` no viaja: es interna, no se le muestra al cliente y no cambia el
 * total. La RPC la recalcula sola desde la base.
 */
export async function getMetodosParaCorreccionAction(): Promise<{
  data: Pick<MetodoPago, "id" | "nombre" | "tipo" | "recargo_porcentaje">[];
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
      .from("metodos_pago")
      .select("id, nombre, tipo, recargo_porcentaje")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[CORRECCION PAGO] No se pudieron leer los métodos:", error);
      return { data: [], error: "No se pudieron cargar los métodos de pago." };
    }

    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("[CORRECCION PAGO] Error inesperado leyendo métodos:", err);
    return { data: [], error: "No se pudieron cargar los métodos de pago." };
  }
}
