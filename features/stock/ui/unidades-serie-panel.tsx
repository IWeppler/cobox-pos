"use client";

import { useEffect, useState } from "react";
import { Barcode, Loader2 } from "lucide-react";
import { getUnidadesDeVarianteAction } from "@/features/sales/actions/get-unidades-serie";

interface UnidadSerieFicha {
  id: string;
  imei: string;
  estado: string;
  fechaIngreso: string;
  fechaVenta: string | null;
  ventaId: string | null;
}

/**
 * Unidades serializadas de una variante, en la ficha del producto.
 *
 * Muestra disponibles y vendidas: es la vista que se usa cuando alguien
 * vuelve con un aparato y hay que saber si salió de acá, cuándo y en qué
 * venta. No se renderiza nada si la variante no tiene unidades — así la
 * ficha de un producto de indumentaria queda exactamente igual que antes.
 */
export function UnidadesSeriePanel({
  varianteId,
}: Readonly<{ varianteId: string | null }>) {
  // Se guarda junto a la variante que se consultó: así, al cambiar de
  // variante, los datos viejos dejan de mostrarse por comparación en vez de
  // por un setState de limpieza dentro del efecto.
  const [cache, setCache] = useState<{
    varianteId: string;
    unidades: UnidadSerieFicha[];
  } | null>(null);

  useEffect(() => {
    if (!varianteId) return;

    let cancelado = false;
    getUnidadesDeVarianteAction(varianteId).then((res) => {
      // La variante pudo cambiar mientras volvía la consulta.
      if (cancelado) return;
      setCache({ varianteId, unidades: res.unidades });
    });

    return () => {
      cancelado = true;
    };
  }, [varianteId]);

  const vigente = cache?.varianteId === varianteId ? cache : null;
  const unidades = vigente?.unidades ?? [];
  const cargando = varianteId !== null && vigente === null;

  if (!varianteId) return null;
  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Buscando números de serie...
      </div>
    );
  }
  if (unidades.length === 0) return null;

  const disponibles = unidades.filter((u) => u.estado === "disponible");

  return (
    <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Barcode className="w-3.5 h-3.5" />
          Números de serie
        </h5>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {disponibles.length} de {unidades.length} disponibles
        </span>
      </div>

      <div className="max-h-48 overflow-y-auto divide-y divide-border/60">
        {unidades.map((unidad) => {
          const vendida = unidad.estado === "vendido";
          // Fail-closed: cualquier estado que no sea 'disponible' se muestra
          // como fuera de stock. Si mañana aparece un estado nuevo, el panel
          // no lo pinta de verde como si se pudiera vender.
          const fueraDeStock = unidad.estado !== "disponible";
          const dadaDeBaja = unidad.estado === "baja";
          return (
            <div
              key={unidad.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span
                className={`font-mono text-xs ${
                  fueraDeStock ? "text-muted-foreground line-through" : ""
                }`}
              >
                {unidad.imei}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${
                  dadaDeBaja
                    ? "text-danger"
                    : fueraDeStock
                      ? "text-muted-foreground"
                      : "text-success"
                }`}
              >
                {dadaDeBaja
                  ? "De baja"
                  : vendida
                    ? unidad.fechaVenta
                      ? `Vendido ${new Date(unidad.fechaVenta).toLocaleDateString("es-AR")}`
                      : "Vendido"
                    : "Disponible"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
