import { create } from "zustand";

/**
 * Abre el modal de cobro de cuenta corriente desde cualquier parte de la app.
 *
 * Mismo patrón y mismo motivo que `caja-modal-store`: el cobro tiene DOS
 * disparadores —el botón de la barra del POS, donde está parada la vendedora
 * cuando la clienta viene a pagar, y el modal de caja, hermano de "Anotar
 * gasto"— y montar el modal en cada uno serían dos formularios en paralelo,
 * cada uno con su propio monto tipeado.
 *
 * El modal se monta UNA vez en el layout del panel (`CobroCuentaCorrienteHost`)
 * y estos disparadores solo lo abren.
 */
interface CobroCcState {
  abierto: boolean;
  /** Cliente con el que arranca el modal, si quien lo abre ya sabe cuál es
   * (ej. el POS con una clienta ya elegida en el ticket). */
  clienteInicialId: string | null;
  abrir: (clienteInicialId?: string | null) => void;
  setAbierto: (abierto: boolean) => void;
}

export const useCobroCcStore = create<CobroCcState>((set) => ({
  abierto: false,
  clienteInicialId: null,
  abrir: (clienteInicialId = null) => set({ abierto: true, clienteInicialId }),
  setAbierto: (abierto) =>
    set(abierto ? { abierto } : { abierto, clienteInicialId: null }),
}));
