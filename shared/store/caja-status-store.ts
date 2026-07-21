import { create } from "zustand";

interface CajaStatusState {
  version: number;
  notifyCajaChanged: () => void;
}

// Señal liviana para que el Sidebar refetchee el estado de caja apenas el
// usuario abre/cierra su propio turno, sin esperar al polling de 60s (que
// queda solo como red de seguridad para cambios hechos por OTRO usuario).
export const useCajaStatusStore = create<CajaStatusState>((set) => ({
  version: 0,
  notifyCajaChanged: () => set((state) => ({ version: state.version + 1 })),
}));
