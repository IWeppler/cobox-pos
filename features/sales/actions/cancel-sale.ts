"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolverTurnoActivo } from "@/entities/caja/lib/resolve-turno-activo";
import { requiereNotaCredito } from "@/shared/lib/facturacion";

export async function anularVentaAction(
  ventaId: string,
  motivoDevolucion: "RESTAURAR_STOCK" | "BAJA",
) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "No autorizado", success: false };

    // 1. Obtener TODOS los detalles de la venta y sus items antes de borrarla
    const { data: venta, error: fetchError } = await supabase
      .from("ventas")
      .select(
        `
        id,
        estado_operacion,
        monto_cobrado,
        monto_pendiente,
        cliente_id,
        ventas_items ( producto_id, variante, variante_id, cantidad ),
        comprobantes ( tipo )
      `,
      )
      .eq("id", ventaId)
      .single();

    if (fetchError || !venta) {
      return { error: "No se encontró la venta solicitada.", success: false };
    }

    // 2. Anulación lógica: preservamos ticket, items, pagos y relaciones contables.
    if (venta.estado_operacion === "ANULADA") {
      return { error: "La venta ya se encuentra anulada.", success: false };
    }

    // Una FACTURA emitida no se anula marcando la venta: se compensa con una
    // nota de crédito, que es un comprobante propio y necesita su CAE. Como la
    // emisión con ARCA todavía no existe, no hay forma de hacerlo bien — y
    // dejar pasar la anulación dejaría una factura viva en ARCA contra una
    // venta que el sistema da por anulada. Fail-closed: se frena.
    //
    // Con TICKET interno esto NUNCA se activa (requiereNotaCredito da false),
    // así que para los negocios de hoy anular sigue funcionando igual. Es la
    // red para el día que se prenda ARCA: quien implemente la emisión de la
    // nota de crédito va a encontrar este freno y lo va a reemplazar por ella.
    if (requiereNotaCredito(venta.comprobantes)) {
      console.error("[ANULACION] Venta con factura emitida", {
        ventaId,
        comprobantes: venta.comprobantes,
      });
      return {
        error:
          "Esta venta tiene una factura emitida: hay que hacerle una nota de crédito en ARCA antes de anularla en el sistema.",
        success: false,
      };
    }

    // La devolución en efectivo sale de la caja abierta AHORA (no de la
    // caja original de la venta, que puede estar cerrada hace rato).
    // Se resuelve antes de mutar nada para no dejar la anulación a medias
    // si la caja está cerrada y la política lo exige.
    let turnoDevolucionId: string | null = null;
    if (venta.monto_cobrado > 0) {
      const { turnoId, requiereCajaAbierta } = await resolverTurnoActivo(
        supabase,
        user.id,
      );
      if (requiereCajaAbierta && !turnoId) {
        return {
          error: "Necesitas abrir la caja antes de anular esta venta.",
          success: false,
        };
      }
      turnoDevolucionId = turnoId;
    }

    // 2bis. TODO EL MOVIMIENTO DE PLATA, EN UNA TRANSACCIÓN
    //
    // Estado de la venta, marcado de los cobros, egreso de caja y crédito de
    // cuenta corriente van juntos en la RPC. Antes eran cuatro escrituras
    // sueltas con dos errores adentro:
    //
    // - El egreso salía por `monto_cobrado` entero, sin mirar el medio de pago:
    //   una venta cobrada con débito sacaba efectivo de un cajón donde esa
    //   plata nunca estuvo, y el turno cerraba con faltante.
    // - El crédito de cuenta corriente usaba `monto_pendiente`, que quedó
    //   congelado en el momento de la venta. Si el cliente ya había pagado
    //   parte del fiado, se le perdonaba lo pagado.
    //
    // El guard de permiso sigue siendo el mismo y sigue yendo primero: la RPC
    // hace el UPDATE condicional y, si la RLS lo niega o la venta ya estaba
    // anulada, lanza sin haber tocado plata ni stock.
    const { data: resultadoAnulacion, error: anulacionError } =
      await supabase.rpc("anular_venta", {
        p_venta_id: ventaId,
        p_motivo: motivoDevolucion,
        p_turno_id: turnoDevolucionId,
      });

    if (anulacionError || !resultadoAnulacion) {
      console.error("[ANULACION] Error anulando la venta:", anulacionError);
      const noAnulable = anulacionError?.message?.includes("VENTA_NO_ANULABLE");
      return {
        error: noAnulable
          ? "No se pudo anular: o ya estaba anulada, o no tenés permiso."
          : "Error de BD al intentar anular la venta.",
        success: false,
      };
    }

    const anulacion = resultadoAnulacion as {
      efectivo_devuelto: number;
      no_efectivo_a_devolver: number;
      credito_aplicado: number;
      excedente_ya_pagado: number;
    };

    // 5. Manejo del Stock para TODOS los items del carrito de compras
    const items = venta.ventas_items || [];

    /** Renglones cuya mercadería volvió al local pero no se pudo sumar al
     * stock. No frena la anulación (la plata ya se movió), pero tiene que
     * llegar a la pantalla: es inventario que quedó sin contar. */
    const itemsSinRestaurar: string[] = [];

    for (const item of items) {
      if (!item.producto_id) continue;

      if (motivoDevolucion === "RESTAURAR_STOCK") {
        // La variante sale de `ventas_items.variante_id`, congelado en el
        // momento de la venta. Antes se buscaba por `nombre_display`, y eso
        // fallaba en silencio cada vez que el talle se había renombrado
        // después: 117 de los 1.032 renglones vendidos ya no matchean por
        // nombre, o sea que anular cualquiera de esas ventas devolvía el stock
        // a ningún lado. El match por nombre queda solo como respaldo para los
        // renglones viejos que el backfill no pudo resolver.
        let varianteId: string | null = item.variante_id ?? null;

        if (!varianteId) {
          const { data: porNombre } = await supabase
            .from("producto_variantes")
            .select("id")
            .eq("producto_id", item.producto_id)
            .eq("nombre_display", item.variante)
            .maybeSingle();
          varianteId = porNombre?.id ?? null;
        }

        if (varianteId) {
          // Delta atómico por la misma RPC que usa la venta para descontar.
          // Antes era leer el stock y después escribir la suma, que es el
          // patrón que ya costó plata dos veces en este proyecto: entre la
          // lectura y la escritura entra una venta de esa variante y el
          // update la pisa.
          const { error: stockError } = await supabase.rpc(
            "ajustar_stock_variante",
            { p_variante_id: varianteId, p_delta: item.cantidad },
          );

          if (stockError) {
            console.error(
              `[ANULACION] No se pudo devolver el stock de "${item.variante}" (venta ${ventaId}):`,
              stockError,
            );
            itemsSinRestaurar.push(item.variante);
          }
        } else {
          // Sin variante no hay a qué devolverle el stock. Antes esto pasaba
          // sin dejar rastro; ahora se avisa, porque es mercadería que volvió
          // al local y no está contada en ningún lado.
          console.error(
            `[ANULACION] Renglón sin variante resoluble, stock NO devuelto: "${item.variante}" (venta ${ventaId})`,
          );
          itemsSinRestaurar.push(item.variante);
        }

        // Espejo legacy, también como delta y con la misma RPC de siempre no
        // disponible acá: se resuelve con un update condicional por la clave
        // única (producto_id, variante), que es atómico a nivel de fila.
        await supabase.rpc("ajustar_stock_legacy", {
          p_producto_id: item.producto_id,
          p_variante: item.variante,
          p_delta: item.cantidad,
        });
      } else if (motivoDevolucion === "BAJA") {
        // La planta volvió rota o seca
        await supabase.from("bajas").insert({
          producto_id: item.producto_id,
          variante: item.variante,
          cantidad: item.cantidad,
          motivo: "Devolución de cliente por producto fallado/roto",
          estado: "APROBADA",
          creado_por: user.id,
          origen: "DEVOLUCION_VENTA",
        });
      }
    }

    // 5.b Devolver los aparatos serializados (IMEI/serie) que salieron en
    // esta venta. Sin esto la unidad queda 'vendido' para siempre: el stock
    // de la variante se restaura arriba pero ese IMEI no se puede volver a
    // elegir en el POS, así que el aparato queda contado y no vendible.
    // Sigue el mismo motivo que el stock: RESTAURAR_STOCK lo devuelve a la
    // vitrina, BAJA lo saca de circulación.
    //
    // No corta la anulación si falla: para cuando llega acá la venta ya está
    // ANULADA y la plata ya salió de la caja. Devolver un error dejaría a la
    // vendedora reintentando sobre una venta ya anulada. Se loguea para
    // poder corregir la unidad a mano.
    const { error: unidadesError } = await supabase.rpc(
      "devolver_unidades_venta",
      {
        p_venta_id: ventaId,
        p_a_stock: motivoDevolucion === "RESTAURAR_STOCK",
      },
    );

    if (unidadesError) {
      console.error(
        `No se pudieron devolver las unidades serializadas de la venta ${ventaId}:`,
        unidadesError,
      );
    }

    // 6. Refrescamos todas las vistas
    revalidatePath("/");
    revalidatePath("/reportes");
    revalidatePath("/ventas");
    revalidatePath("/stock");
    revalidatePath("/caja");
    revalidatePath("/clientes");

    // Lo que la anulación NO resuelve sola tiene que llegar al mostrador. Son
    // tres cosas distintas y ninguna es un error: la venta se anuló bien.
    //
    // - `noEfectivo`: se cobró por tarjeta/transferencia, así que se devuelve
    //   por donde entró. La caja no lo toca.
    // - `yaPagado`: lo que el cliente ya había amortizado de ESTE fiado. No se
    //   devuelve solo porque los pagos de cuenta corriente no están imputados a
    //   una venta: la base no sabe cuánto de ese pago era de este ticket ni con
    //   qué medio se cobró. Adivinarlo sería mover plata por una suposición.
    // - `sinStock`: mercadería que volvió y no se pudo sumar al inventario.
    const avisos: string[] = [];

    if (anulacion.no_efectivo_a_devolver > 0) {
      avisos.push(
        `$${Math.round(anulacion.no_efectivo_a_devolver).toLocaleString("es-AR")} se cobraron por tarjeta o transferencia: devolvelos por ese medio, no salen de la caja.`,
      );
    }
    if (anulacion.excedente_ya_pagado > 0) {
      avisos.push(
        `El cliente ya había pagado $${Math.round(anulacion.excedente_ya_pagado).toLocaleString("es-AR")} de esta cuenta. Eso hay que devolvérselo aparte.`,
      );
    }
    if (itemsSinRestaurar.length > 0) {
      avisos.push(
        `No se pudo devolver al stock: ${itemsSinRestaurar.join(", ")}. Cargalo a mano.`,
      );
    }

    return {
      error: null,
      success: true,
      efectivoDevuelto: anulacion.efectivo_devuelto,
      avisos,
    };
  } catch (err) {
    console.error("Error in anularVentaAction:", err);
    return {
      error: "Ocurrió un error inesperado al intentar anular.",
      success: false,
    };
  }
}
