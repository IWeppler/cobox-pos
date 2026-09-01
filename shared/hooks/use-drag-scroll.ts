"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Píxeles que hay que recorrer para que el gesto pase de "click" a
 * "arrastre". Por debajo de esto el movimiento es el temblor normal de la
 * mano al hacer click y el click tiene que seguir funcionando.
 */
const UMBRAL_ARRASTRE_PX = 5;

/**
 * Arrastrar con el mouse para scrollear una fila horizontal, como se hace
 * con el dedo en una pantalla táctil.
 *
 * Por qué solo mouse: en táctil el navegador YA hace el pan y además se
 * ocupa de no disparar el click cuando el dedo se desplazó. Interceptar el
 * gesto ahí sería reemplazar scroll nativo (con inercia y rebote) por uno
 * peor. El agujero está en el mouse: sobre una fila con `overflow-x-auto`,
 * mantener presionado y mover no scrollea nada, y en las tablets del
 * mostrador que se usan con mouse la única salida era la rueda o llegar a
 * la barra de scroll — que en esta barra está oculta a propósito.
 *
 * La otra mitad del problema es el click: al soltar después de arrastrar,
 * el navegador dispara el click del botón que quedó abajo del cursor, así
 * que scrollear las categorías terminaría filtrando por una categoría al
 * azar. Por eso el hook cancela el click en fase de captura cuando hubo
 * arrastre — antes de que llegue al `onClick` del botón.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  /** Estado del gesto en curso. null = no hay botón apretado. */
  const gesto = useRef<{
    inicioX: number;
    scrollInicial: number;
    arrastro: boolean;
  } | null>(null);
  /** Sobrevive al pointerup para que el click siguiente sepa que hubo arrastre. */
  const huboArrastre = useRef(false);

  const onPointerDown = useCallback((evento: React.PointerEvent<T>) => {
    if (evento.pointerType !== "mouse" || evento.button !== 0) return;

    const elemento = ref.current;
    if (!elemento) return;

    gesto.current = {
      inicioX: evento.clientX,
      scrollInicial: elemento.scrollLeft,
      arrastro: false,
    };
    huboArrastre.current = false;
  }, []);

  const onPointerMove = useCallback((evento: React.PointerEvent<T>) => {
    const enCurso = gesto.current;
    const elemento = ref.current;
    if (!enCurso || !elemento) return;

    const delta = evento.clientX - enCurso.inicioX;

    if (!enCurso.arrastro) {
      if (Math.abs(delta) < UMBRAL_ARRASTRE_PX) return;
      enCurso.arrastro = true;
      huboArrastre.current = true;
      // Recién acá se captura el puntero: si se capturara en el pointerdown,
      // un click común sobre un botón perdería el evento y dejaría de andar.
      elemento.setPointerCapture(evento.pointerId);
      elemento.style.cursor = "grabbing";
      // Sin esto el navegador entra en modo selección de texto y arrastra
      // los nombres de las categorías en vez de la fila.
      elemento.style.userSelect = "none";
    }

    elemento.scrollLeft = enCurso.scrollInicial - delta;
  }, []);

  const terminar = useCallback((evento: React.PointerEvent<T>) => {
    const elemento = ref.current;
    if (!elemento || !gesto.current) return;

    if (elemento.hasPointerCapture(evento.pointerId)) {
      elemento.releasePointerCapture(evento.pointerId);
    }
    elemento.style.cursor = "";
    elemento.style.userSelect = "";
    gesto.current = null;
  }, []);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    const cancelarClickDeArrastre = (evento: MouseEvent) => {
      if (!huboArrastre.current) return;
      huboArrastre.current = false;
      evento.preventDefault();
      evento.stopPropagation();
    };

    elemento.addEventListener("click", cancelarClickDeArrastre, true);
    return () =>
      elemento.removeEventListener("click", cancelarClickDeArrastre, true);
  }, []);

  return {
    ref,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: terminar,
      onPointerCancel: terminar,
    },
  };
}
