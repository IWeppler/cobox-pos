import { create } from "zustand";
import { contarVentasPendientes } from "@/features/sales/lib/outbox-ventas";
import { sincronizarVentas } from "@/features/sales/lib/sincronizar-ventas";

/**
 * Cuántas ventas cobradas sin señal están esperando subir.
 *
 * Vive en un store global —y no en el componente que sincroniza— porque tres
 * lugares distintos necesitan el MISMO número: el aviso del panel, el cierre
 * de turno (que se bloquea si hay pendientes) y el POS después de cobrar. Un
 * conteo por pantalla daría tres respuestas distintas al mismo tiempo.
 *
 * Mismo patrón que `caja-status-store`.
 */
interface VentasPendientesState {
  pendientes: number;
  /** Las que el server RECHAZÓ: no se arreglan reintentando. */
  rechazadas: number;
  sincronizando: boolean;
  refrescar: (negocioId: string) => Promise<void>;
  /** Sube lo que haya. Devuelve cuántas subieron, para poder avisar. */
  sincronizar: (negocioId: string) => Promise<number>;
}

export const useVentasPendientesStore = create<VentasPendientesState>(
  (set, get) => ({
    pendientes: 0,
    rechazadas: 0,
    sincronizando: false,

    refrescar: async (negocioId) => {
      set({ pendientes: await contarVentasPendientes(negocioId) });
    },

    sincronizar: async (negocioId) => {
      // Dos sincronizaciones en paralelo mandarían la misma venta dos veces.
      // No duplicaría nada —la base la reconoce por su id— pero sí gastaría el
      // doble de red justo cuando la red es el problema.
      if (get().sincronizando) return 0;

      set({ sincronizando: true });
      try {
        const resultado = await sincronizarVentas(negocioId);
        set({
          pendientes: await contarVentasPendientes(negocioId),
          rechazadas: resultado.rechazadas.length,
        });
        return resultado.subidas;
      } finally {
        set({ sincronizando: false });
      }
    },
  }),
);
