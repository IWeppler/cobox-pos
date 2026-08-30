import { create } from "zustand";

/**
 * La paleta de comandos (Ctrl+K), abierta desde cualquier parte de la app.
 *
 * Mismo patrón que `caja-modal-store` y `cobro-cc-store`: el componente se
 * monta UNA vez en el layout del panel y esto solo lo abre. Con una instancia
 * por pantalla, el atajo global abriría todas a la vez.
 */
interface PaletaState {
  abierta: boolean;
  abrir: () => void;
  cerrar: () => void;
  alternar: () => void;
}

export const usePaletaStore = create<PaletaState>((set) => ({
  abierta: false,
  abrir: () => set({ abierta: true }),
  cerrar: () => set({ abierta: false }),
  alternar: () => set((estado) => ({ abierta: !estado.abierta })),
}));
