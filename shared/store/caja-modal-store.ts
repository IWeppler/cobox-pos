import { create } from "zustand";

/**
 * Abre el modal de caja desde cualquier parte de la app.
 *
 * El modal vive dentro de CajaStatusButton (el chip "Caja abierta / Caja
 * cerrada" del navbar), que es el único lugar donde se abre y se cierra el
 * turno. Antes su estado era local, así que nada fuera del navbar podía
 * disparar ese modal, y todo lo que quería mandar a "abrí la caja" terminaba
 * navegando a /caja — que muestra el historial y los arqueos, pero NO es donde
 * se abre el turno. El usuario llegaba a una pantalla que no tenía el botón
 * que le prometieron.
 *
 * El estado sube al store en vez de duplicar el modal: dos instancias serían
 * dos turnos abriéndose en paralelo, cada una con su copia del formulario.
 */
interface CajaModalState {
  abierto: boolean;
  abrir: () => void;
  setAbierto: (abierto: boolean) => void;
}

export const useCajaModalStore = create<CajaModalState>((set) => ({
  abierto: false,
  abrir: () => set({ abierto: true }),
  setAbierto: (abierto) => set({ abierto }),
}));
