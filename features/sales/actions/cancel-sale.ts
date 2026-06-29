"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

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

    // 1. Obtener detalles de la venta antes de borrarla
    const { data: venta, error: fetchError } = await supabase
      .from("ventas")
      .select(
        "producto_id, variante, cantidad, total, cliente_id, estado_pago, monto_cobrado, monto_pendiente",
      )
      .eq("id", ventaId)
      .single();

    if (fetchError || !venta) {
      return { error: "No se encontró la venta solicitada.", success: false };
    }

    // 2. Eliminar el registro de la venta (o podríamos marcarla como ANULADA, pero por simplicidad del MVP la borramos)
    const { error: deleteError } = await supabase
      .from("ventas")
      .delete()
      .eq("id", ventaId);

    if (deleteError) {
      console.error(deleteError);
      return { error: "Error al intentar anular la venta.", success: false };
    }

    const montoPendiente = Number(venta.monto_pendiente || 0);
    const montoCobrado = Number(venta.monto_cobrado ?? venta.total);
    const fueCuentaCorriente =
      venta.estado_pago === "PARCIAL" || montoPendiente > 0;
    const ticketCorto = ventaId.split("-")[0].toUpperCase();

    if (fueCuentaCorriente && montoPendiente > 0 && venta.cliente_id) {
      const { error: ccError } = await supabase
        .from("cuenta_corriente_movimientos")
        .insert({
          cliente_id: venta.cliente_id,
          tipo: "CREDITO",
          monto: montoPendiente,
          descripcion: `Anulacion deuda - Ticket #${ticketCorto}`,
          creado_por: user.id,
        });

      if (ccError) {
        console.error("Error al cancelar deuda en CC:", ccError);
        return {
          error:
            "La venta se anulo, pero no se pudo cancelar la deuda del cliente.",
          success: false,
        };
      }

      const { data: clienteActual } = await supabase
        .from("clientes")
        .select("saldo_pendiente")
        .eq("id", venta.cliente_id)
        .single();

      const saldoActual = Number(clienteActual?.saldo_pendiente || 0);
      await supabase
        .from("clientes")
        .update({
          saldo_pendiente: Math.max(0, saldoActual - montoPendiente),
        })
        .eq("id", venta.cliente_id);
    }

    const montoADevolverCaja = fueCuentaCorriente
      ? Math.max(0, montoCobrado)
      : Number(venta.total || 0);

    if (montoADevolverCaja > 0.05) {
      await supabase.from("egresos").insert({
        concepto: `Devolucion Venta #${ticketCorto}`,
        monto: montoADevolverCaja,
        creado_por: user.id,
      });
    }

    // 4. Manejo del Stock según la decisión del usuario
    if (venta.producto_id) {
      if (motivoDevolucion === "RESTAURAR_STOCK") {
        // La planta está sana, vuelve a la estantería
        const { data: stockActual } = await supabase
          .from("productos_stock")
          .select("id, cantidad")
          .eq("producto_id", venta.producto_id)
          .eq("variante", venta.variante)
          .single();

        if (stockActual) {
          await supabase
            .from("productos_stock")
            .update({ cantidad: stockActual.cantidad + venta.cantidad })
            .eq("id", stockActual.id);
        } else {
          await supabase.from("productos_stock").insert({
            producto_id: venta.producto_id,
            variante: venta.variante,
            cantidad: venta.cantidad,
          });
        }
      } else if (motivoDevolucion === "BAJA") {
        // La planta volvió rota o seca, registramos la pérdida operativa
        await supabase.from("bajas").insert({
          producto_id: venta.producto_id,
          variante: venta.variante,
          cantidad: venta.cantidad,
          motivo: "Devolución por producto fallado/roto",
          estado: "APROBADA",
          creado_por: user.id,
        });
      }
    }

    // 5. Refrescamos las vistas
    revalidatePath("/ventas");
    revalidatePath("/stock");
    revalidatePath("/caja");
    revalidatePath("/clientes");

    return { error: null, success: true };
  } catch (err) {
    console.error("Error in anularVentaAction:", err);
    return {
      error: "Ocurrió un error inesperado al intentar anular.",
      success: false,
    };
  }
}
