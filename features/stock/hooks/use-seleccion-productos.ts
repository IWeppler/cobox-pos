"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/** Long press que entra en "modo selección" (mobile). 420ms es el punto donde
 * ya no se confunde con un tap pero todavía no se siente trabado. */
const LONG_PRESS_MS = 420;
/** Si el dedo se movió más que esto, era scroll, no long press. */
const LONG_PRESS_TOLERANCIA_PX = 10;

export interface PropsSeleccionables {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export interface SeleccionProductos {
  ids: ReadonlySet<string>;
  idsArray: string[];
  cantidad: number;
  /** En mobile no hay checkbox: el modo se enciende con long press y mientras
   * está activo el tap sobre la fila/card selecciona en vez de abrir el
   * detalle. En desktop manda el checkbox y el modo nunca se enciende solo. */
  modoSeleccion: boolean;
  estaSeleccionado: (id: string) => boolean;
  toggle: (id: string, opciones?: { extenderRango?: boolean }) => void;
  /** Todos los de la página visible están seleccionados. */
  paginaCompleta: boolean;
  /** Todo el set filtrado (todas las páginas) está seleccionado. */
  filtroCompleto: boolean;
  totalFiltrado: number;
  seleccionarPagina: () => void;
  seleccionarTodoElFiltro: () => void;
  limpiar: () => void;
  /** Handlers de fila/card: long press en touch + tap-para-seleccionar. */
  propsSeleccionables: (id: string) => PropsSeleccionables;
}

interface Params {
  /** TODO el set que matchea los filtros actuales, ya ordenado (todas las
   * páginas). Es la base de "seleccionar los N que coinciden" y del rango
   * con shift, que tiene que poder cruzar el corte de página. */
  idsFiltrados: string[];
  /** Solo la página visible. */
  idsPagina: string[];
}

/**
 * Selección múltiple del módulo de Stock, elevada por encima de la tabla/
 * grilla para que sobreviva a cambiar de página y de vista.
 *
 * Regla deliberada: la selección se PODA contra el set filtrado. Si cambiás
 * la búsqueda o la categoría, lo que dejó de matchear sale de la selección.
 * Sin esto un "Eliminar" podría llevarse productos que el usuario ya no ve en
 * pantalla y no recuerda haber tocado — y acá eliminar es definitivo.
 */
export function useSeleccionProductos({
  idsFiltrados,
  idsPagina,
}: Params): SeleccionProductos {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [modoSeleccionActivado, setModoSeleccionActivado] = useState(false);

  const setFiltrados = useMemo(() => new Set(idsFiltrados), [idsFiltrados]);

  // Poda contra el filtro vigente, ajustando el estado DURANTE el render (no
  // en un efecto): así el mismo render que trae el filtro nuevo ya devuelve
  // la selección podada, sin un paso intermedio en el que la barra muestra un
  // conteo que incluye productos que ya no matchean.
  const [filtroConocido, setFiltroConocido] = useState(setFiltrados);
  if (filtroConocido !== setFiltrados) {
    setFiltroConocido(setFiltrados);
    if (ids.size > 0) {
      const podado = new Set<string>();
      ids.forEach((id) => {
        if (setFiltrados.has(id)) podado.add(id);
      });
      // Solo si algo cambió: si no, se instalaría un Set nuevo en cada cambio
      // de identidad del array y re-dispararía todo lo que depende del Set.
      if (podado.size !== ids.size) setIds(podado);
    }
  }

  // Quedarse en modo selección con 0 seleccionados deja las filas "muertas"
  // (ni abren el detalle ni se ven seleccionadas). Se deriva en vez de
  // apagarse a mano en cada camino de salida (tap, "Ninguno", poda).
  const modoSeleccion = modoSeleccionActivado && ids.size > 0;

  // Ancla del rango con shift: el último id tocado sin shift.
  const anclaRango = useRef<string | null>(null);

  const toggle = useCallback(
    (id: string, opciones?: { extenderRango?: boolean }) => {
      setIds((prev) => {
        const siguiente = new Set(prev);

        // El rango se calcula sobre idsFiltrados, no sobre la página: un
        // shift-click puede abarcar productos que quedaron en otra página.
        if (opciones?.extenderRango && anclaRango.current) {
          const desde = idsFiltrados.indexOf(anclaRango.current);
          const hasta = idsFiltrados.indexOf(id);
          if (desde !== -1 && hasta !== -1) {
            const [inicio, fin] =
              desde <= hasta ? [desde, hasta] : [hasta, desde];
            for (let i = inicio; i <= fin; i++) {
              siguiente.add(idsFiltrados[i]);
            }
            return siguiente;
          }
        }

        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);
        anclaRango.current = id;
        return siguiente;
      });
    },
    [idsFiltrados],
  );

  const paginaCompleta =
    idsPagina.length > 0 && idsPagina.every((id) => ids.has(id));
  const filtroCompleto =
    idsFiltrados.length > 0 && ids.size === idsFiltrados.length;

  const seleccionarPagina = useCallback(() => {
    setIds((prev) => {
      const todaSeleccionada =
        idsPagina.length > 0 && idsPagina.every((id) => prev.has(id));
      if (todaSeleccionada) {
        const siguiente = new Set(prev);
        idsPagina.forEach((id) => siguiente.delete(id));
        return siguiente;
      }
      return new Set([...prev, ...idsPagina]);
    });
  }, [idsPagina]);

  const seleccionarTodoElFiltro = useCallback(() => {
    setIds(new Set(idsFiltrados));
  }, [idsFiltrados]);

  const limpiar = useCallback(() => {
    setIds(new Set());
    anclaRango.current = null;
  }, []);

  // --- LONG PRESS (solo touch) ---
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDisparado = useRef(false);
  const puntoInicial = useRef<{ x: number; y: number } | null>(null);

  const cancelarLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    puntoInicial.current = null;
  }, []);

  const propsSeleccionables = useCallback(
    (id: string): PropsSeleccionables => ({
      onPointerDown: (e) => {
        // Con mouse el long press no aplica: en desktop está el checkbox.
        if (e.pointerType === "mouse") return;
        cancelarLongPress();
        longPressDisparado.current = false;
        puntoInicial.current = { x: e.clientX, y: e.clientY };
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressDisparado.current = true;
          setModoSeleccionActivado(true);
          setIds((prev) => new Set(prev).add(id));
          anclaRango.current = id;
          navigator.vibrate?.(25);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        if (!longPressTimer.current || !puntoInicial.current) return;
        const dx = Math.abs(e.clientX - puntoInicial.current.x);
        const dy = Math.abs(e.clientY - puntoInicial.current.y);
        if (dx > LONG_PRESS_TOLERANCIA_PX || dy > LONG_PRESS_TOLERANCIA_PX) {
          cancelarLongPress();
        }
      },
      onPointerUp: cancelarLongPress,
      onPointerCancel: cancelarLongPress,
      onPointerLeave: cancelarLongPress,
      onClick: (e) => {
        // El click sintético que sigue al long press no debe deseleccionar lo
        // que el long press acaba de seleccionar.
        if (longPressDisparado.current) {
          longPressDisparado.current = false;
          return;
        }
        if (!modoSeleccion) return;
        toggle(id, { extenderRango: e.shiftKey });
      },
      // Sin esto, mantener el dedo sobre el nombre/imagen abre el menú nativo
      // de iOS/Android justo cuando entra el modo.
      onContextMenu: (e) => e.preventDefault(),
    }),
    [cancelarLongPress, modoSeleccion, toggle],
  );

  const idsArray = useMemo(() => Array.from(ids), [ids]);

  const estaSeleccionado = useCallback((id: string) => ids.has(id), [ids]);

  return {
    ids,
    idsArray,
    cantidad: ids.size,
    modoSeleccion,
    estaSeleccionado,
    toggle,
    paginaCompleta,
    filtroCompleto,
    totalFiltrado: idsFiltrados.length,
    seleccionarPagina,
    seleccionarTodoElFiltro,
    limpiar,
    propsSeleccionables,
  };
}
