import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookmarkCheck, Undo2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  devolverReservaAction,
  listarReservasActivasAction,
} from "@/features/reservations/actions/manage-reservations";
import { ConfirmarVentaReservaButton } from "@/features/reservations/ui/confirmar-venta-reserva-button";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";

export const dynamic = "force-dynamic";

async function devolverReserva(reservaId: string) {
  "use server";
  await devolverReservaAction(reservaId);
}

export default async function ReservasPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ADMIN") {
    redirect("/stock");
  }

  const { data: reservas, error } = await listarReservasActivasAction();

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Error cargando reservas.
      </div>
    );
  }

  return (
    <div className="space-y-6 mx-auto p-2">
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
            Reservas activas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Unidades apartadas para un cliente. No descuentan stock real ni
            generan una venta hasta que se confirmen.
          </p>
        </div>
      </div>

      {!reservas || reservas.length === 0 ? (
        <div className="bg-muted/30 border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
          No hay reservas activas por el momento.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reservas.map((reserva) => {
            const producto = Array.isArray(reserva.producto)
              ? reserva.producto[0]
              : reserva.producto;
            const variante = Array.isArray(reserva.variante)
              ? reserva.variante[0]
              : reserva.variante;
            const cliente = Array.isArray(reserva.cliente)
              ? reserva.cliente[0]
              : reserva.cliente;
            const precio = variante?.precio ?? producto?.precio ?? null;

            return (
              <div
                key={reserva.id}
                className="bg-card border border-border rounded-xl p-5 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/60" />
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground truncate">
                      {producto?.nombre || "Producto eliminado"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Variante: {variante?.nombre_display || "-"}
                    </p>
                  </div>
                  {precio != null && (
                    <span className="shrink-0 font-semibold text-sm text-foreground">
                      {formatearMoneda(precio)}
                    </span>
                  )}
                </div>

                <div className="bg-muted/50 p-3 rounded-lg text-sm mb-4 space-y-1">
                  <p className="font-medium text-foreground text-xs uppercase tracking-wider">
                    Cliente
                  </p>
                  <p className="text-muted-foreground">
                    {cliente?.nombre || "Cliente eliminado"}
                    {cliente?.telefono ? ` · ${cliente.telefono}` : ""}
                  </p>
                  {reserva.nota ? (
                    <p className="text-muted-foreground italic pt-1 border-t border-border/50 mt-2">
                      {reserva.nota}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Reservado el {formatearFechaHora(reserva.creado_en)}
                  </p>
                </div>

                <div className="flex gap-2 w-full">
                  <form
                    action={devolverReserva.bind(null, reserva.id)}
                    className="flex-1"
                  >
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full"
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                      Devolver a stock
                    </Button>
                  </form>
                  <div className="flex-1">
                    {producto && variante ? (
                      <ConfirmarVentaReservaButton
                        reservaId={reserva.id}
                        productoId={producto.id}
                        varianteId={variante.id}
                        nombreProducto={producto.nombre || "Producto"}
                        varianteNombre={variante.nombre_display}
                        precio={precio}
                      />
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled
                        className="h-8 text-xs w-full"
                      >
                        <BookmarkCheck className="w-3.5 h-3.5 mr-1.5" />
                        Sin datos
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
