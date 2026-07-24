import { create } from "zustand";
import { createClient } from "@/shared/config/supabase/client";
import { getSupabaseRelation } from "@/entities/ventas/types";

export interface TurnoCajaResumen {
  id: string;
  monto_inicial: number;
  fecha_apertura: string;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
}

interface CajaStatusState {
  version: number;
  isCajaAbierta: boolean | null;
  turno: TurnoCajaResumen | null;
  notifyCajaChanged: () => void;
  fetchCajaStatus: (modo: string, userId: string) => Promise<void>;
}

/**
 * Fuente única del estado de caja (abierta/cerrada + resumen del turno
 * propio) para todo lo que viva en navbar/sidebar. El polling de 60s +
 * pausa por visibilitychange sigue viviendo en Sidebar (ver sidebar.tsx) —
 * este store solo guarda el resultado de esa única llamada, así el botón
 * de caja del navbar (u otro componente) lo lee reactivamente sin
 * disparar su propio fetch.
 */
export const useCajaStatusStore = create<CajaStatusState>((set) => ({
  version: 0,
  isCajaAbierta: null,
  turno: null,

  // Señal liviana para refetchear el estado de caja apenas el usuario
  // abre/cierra su propio turno, sin esperar al polling de 60s (que queda
  // solo como red de seguridad para cambios hechos por OTRO usuario).
  notifyCajaChanged: () => set((state) => ({ version: state.version + 1 })),

  fetchCajaStatus: async (modo, userId) => {
    const supabase = createClient();

    let query = supabase
      .from("turnos_caja")
      .select(
        "id, monto_inicial, fecha_apertura, vendedor_id, perfiles(nombre)",
      )
      .eq("estado", "ABIERTO");

    query =
      modo === "UNICA"
        ? query.eq("modo", "UNICA")
        : query.eq("modo", "POR_USUARIO").eq("vendedor_id", userId);

    const { data } = await query.limit(1).maybeSingle();

    set({
      isCajaAbierta: !!data,
      turno: data
        ? {
            id: data.id,
            monto_inicial: Number(data.monto_inicial),
            fecha_apertura: data.fecha_apertura,
            vendedor_id: data.vendedor_id,
            vendedor_nombre:
              getSupabaseRelation(data.perfiles)?.nombre ?? null,
          }
        : null,
    });
  },
}));
