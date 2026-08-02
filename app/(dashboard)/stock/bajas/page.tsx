import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// --- ACTIONS INTERNOS ---
async function aprobarBaja(
  bajasId: string,
  productoId: string,
  variante: string,
  cantidadA_restar: number,
) {
  "use server";
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Descuento atómico en producto_variantes.stock, condicionado a que
  // alcance — `bajas` guarda `variante` como texto (nombre_display), no
  // variante_id, así que primero hay que resolver la fila real (mismo
  // match por nombre que ya usa merge-purchase.ts).
  const { data: varianteRow } = await supabase
    .from("producto_variantes")
    .select("id")
    .eq("producto_id", productoId)
    .eq("nombre_display", variante)
    .maybeSingle();

  if (varianteRow) {
    const { data: descontado, error: descuentoError } = await supabase.rpc(
      "ajustar_stock_variante",
      { p_variante_id: varianteRow.id, p_delta: -cantidadA_restar },
    );

    if (descuentoError || !descontado || descontado.length === 0) {
      redirect("/stock/bajas?error=stock_insuficiente");
    }
  }

  // 2. Espejo en productos_stock (legacy) — la validación real ya se hizo
  // arriba si había producto_variantes; este UPDATE no necesita su propio
  // chequeo atómico, mismo criterio que create-sale.ts.
  const { data: stockItem } = await supabase
    .from("productos_stock")
    .select("id, cantidad")
    .eq("producto_id", productoId)
    .eq("variante", variante)
    .single();

  if (stockItem) {
    const nuevoStock = Math.max(0, stockItem.cantidad - cantidadA_restar);
    await supabase
      .from("productos_stock")
      .update({ cantidad: nuevoStock })
      .eq("id", stockItem.id);
  }

  // 3. Cambiar el estado de la baja a APROBADA
  await supabase.from("bajas").update({ estado: "APROBADA" }).eq("id", bajasId);

  revalidatePath("/stock");
  revalidatePath("/stock/bajas");
}

async function rechazarBaja(bajaId: string) {
  "use server";
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  await supabase.from("bajas").update({ estado: "RECHAZADA" }).eq("id", bajaId);

  revalidatePath("/stock/bajas");
}

// --- PÁGINA ---
export default async function BajasPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ error?: string }>;
}>) {
  const { error: errorParam } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Verificación estricta de Admin
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: rolActual } = await supabase.rpc("rol_actual");

  if (rolActual !== "ADMIN") {
    redirect("/stock"); // Si un vendedor se cuela por URL, lo pateamos al inventario
  }

  // 2. Traer las bajas pendientes y el historial
  const { data: bajas, error } = await supabase
    .from("bajas")
    .select(
      `
      id,
      variante,
      cantidad,
      motivo,
      estado,
      creado_en,
      producto_id,
      productos ( nombre ),
      perfiles ( nombre )
    `,
    )
    .order("creado_en", { ascending: false });

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">Error cargando bajas.</div>
    );
  }

  const pendientes = bajas?.filter((b) => b.estado === "PENDIENTE") || [];
  const historial = bajas?.filter((b) => b.estado !== "PENDIENTE") || [];

  return (
    <div className="space-y-6 mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-border pb-4">
        <Link href="/stock" className="shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Bajas de Inventario
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Aprueba o rechaza los reportes de productos dañados o faltantes.
          </p>
        </div>
      </div>

      {errorParam === "stock_insuficiente" && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          No se pudo aprobar esa baja: la cantidad reportada supera el stock
          disponible de esa variante. Revisá el stock actual antes de
          reintentar.
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Pendientes de Revisión ({pendientes.length})
        </h2>

        {pendientes.length === 0 ? (
          <div className="bg-muted/30 border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
            No hay reportes de bajas pendientes de revisión. ¡Excelente!
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendientes.map((baja) => (
              <div
                key={baja.id}
                className="bg-white border border-amber-200 rounded-xl p-5 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-foreground truncate max-w-45">
                      {/* @ts-expect-error nombre no existe */}
                      {baja.productos?.nombre || "Producto Eliminado"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Variante: {baja.variante}
                    </p>
                  </div>
                  <Badge variant="warning">-{baja.cantidad}</Badge>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg text-sm mb-4">
                  <p className="font-medium text-foreground text-xs mb-1 uppercase tracking-wider">
                    Motivo Reportado
                  </p>
                  <p className="text-muted-foreground">{baja.motivo}</p>
                  <p className="text-[10px] text-muted-foreground mt-2 italic">
                    {/* @ts-expect-error nombre no existe */}
                    Reportado por: {baja.perfiles?.nombre || "Usuario"} •{" "}
                    {new Date(baja.creado_en).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>

                <div className="flex gap-2 w-full">
                  <form
                    action={rechazarBaja.bind(null, baja.id)}
                    className="flex-1"
                  >
                    <Button
                      type="submit"
                      variant="destructive"
                    >
                      Rechazar
                    </Button>
                  </form>
                  <form
                    action={aprobarBaja.bind(
                      null,
                      baja.id,
                      baja.producto_id,
                      baja.variante,
                      baja.cantidad,
                    )}
                    className="flex-1"
                  >
                    <Button
                      type="submit"
                      variant="default"
                      className="w-full"
                    >
                      Aprobar
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {historial.length > 0 && (
        <div className="space-y-4 pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-muted-foreground">
            Historial de Bajas
          </h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-bold">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historial.slice(0, 10).map((baja) => (
                  <tr key={baja.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(baja.creado_en).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {/* @ts-expect-error nombre no existe en any */}
                      {baja.productos?.nombre}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({baja.variante})
                      </span>
                      <span className="ml-2 text-danger font-bold">
                        -{baja.cantidad}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {baja.motivo}
                    </td>
                    <td className="px-4 py-3">
                      {baja.estado === "APROBADA" ? (
                        <Badge
                          variant="success"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Aprobada
                        </Badge>
                      ) : (
                        <Badge
                          variant="danger"
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Rechazada
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
