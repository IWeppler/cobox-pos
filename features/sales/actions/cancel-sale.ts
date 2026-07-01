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
        turno_caja_id,
        ventas_items ( producto_id, variante, cantidad )
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

    const { error: updateVentaError } = await supabase
      .from("ventas")
      .update({
        estado_operacion: "ANULADA",
        estado_pago: "ANULADA",
      })
      .eq("id", ventaId);

    if (updateVentaError) {
      console.error(updateVentaError);
      return {
        error: "Error de BD al intentar anular la venta.",
        success: false,
      };
    }

    const { error: updatePagosError } = await supabase
      .from("venta_pagos")
      .update({ estado_pago_operacion: "ANULADO" })
      .eq("venta_id", ventaId);

    if (updatePagosError) {
      console.error(updatePagosError);
      return {
        error: "Error de BD al intentar anular los pagos de la venta.",
        success: false,
      };
    }

    // 3. Registrar el egreso de dinero de la caja (SÓLO lo que se pagó realmente)
    if (venta.monto_cobrado > 0) {
      await supabase.from("egresos").insert({
        concepto: `Devolución Venta #${ventaId.split("-")[0].toUpperCase()}`,
        monto: venta.monto_cobrado,
        creado_por: user.id,
      });
    }

    // 4. Si la venta tenía deuda (Fiado), restarle esa deuda al cliente porque se anuló el ticket
    if (venta.monto_pendiente > 0 && venta.cliente_id) {
      const { data: cli } = await supabase
        .from("clientes")
        .select("saldo_pendiente")
        .eq("id", venta.cliente_id)
        .single();
      if (cli) {
        await supabase
          .from("clientes")
          .update({
            saldo_pendiente: Math.max(
              0,
              Number(cli.saldo_pendiente) - venta.monto_pendiente,
            ),
          })
          .eq("id", venta.cliente_id);
      }

      const { error: ccError } = await supabase
        .from("cuenta_corriente_movimientos")
        .insert({
          cliente_id: venta.cliente_id,
          venta_id: ventaId,
          tipo: "CREDITO",
          monto: venta.monto_pendiente,
          descripcion: `Anulación de Venta #${ventaId}`,
          creado_por: user.id,
        });

      if (ccError) {
        console.error(ccError);
        return {
          error: "Error al registrar el movimiento de cuenta corriente.",
          success: false,
        };
      }
    }

    // 5. Manejo del Stock para TODOS los items del carrito de compras
    const items = venta.ventas_items || [];

    for (const item of items) {
      if (!item.producto_id) continue;

      if (motivoDevolucion === "RESTAURAR_STOCK") {
        // Restauramos en la tabla principal de JSONB
        const { data: varNueva } = await supabase
          .from("producto_variantes")
          .select("id, stock")
          .eq("producto_id", item.producto_id)
          .eq("nombre_display", item.variante)
          .maybeSingle();
        if (varNueva) {
          await supabase
            .from("producto_variantes")
            .update({ stock: varNueva.stock + item.cantidad })
            .eq("id", varNueva.id);
        }

        // Restauramos también en la tabla Legacy (Retrocompatibilidad)
        const { data: stockViejo } = await supabase
          .from("productos_stock")
          .select("id, cantidad")
          .eq("producto_id", item.producto_id)
          .eq("variante", item.variante)
          .maybeSingle();
        if (stockViejo) {
          await supabase
            .from("productos_stock")
            .update({ cantidad: stockViejo.cantidad + item.cantidad })
            .eq("id", stockViejo.id);
        } else if (!varNueva) {
          // Si no existía en ningún lado, la creamos
          await supabase.from("productos_stock").insert({
            producto_id: item.producto_id,
            variante: item.variante,
            cantidad: item.cantidad,
          });
        }
      } else if (motivoDevolucion === "BAJA") {
        // La planta volvió rota o seca
        await supabase.from("bajas").insert({
          producto_id: item.producto_id,
          variante: item.variante,
          cantidad: item.cantidad,
          motivo: "Devolución de cliente por producto fallado/roto",
          estado: "APROBADA",
          creado_por: user.id,
        });
      }
    }

    // 6. Refrescamos todas las vistas
    revalidatePath("/");
    revalidatePath("/reportes");
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
