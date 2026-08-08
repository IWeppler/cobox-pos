"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Overlay bloqueante para las operaciones largas de la conciliación.
 *
 * Por qué existe: impactar un remito grande o crear todos los productos
 * sugeridos puede tardar bastante, y hasta ahora lo único que se veía era el
 * texto "Procesando..." dentro del botón. En un remito de cientos de renglones
 * eso se lee como una pantalla colgada, y el riesgo concreto es que alguien
 * recargue o toque atrás en el medio.
 *
 * Tres cosas que tiene que dejar claras:
 * 1. Que está pasando algo (spinner + cronómetro que avanza).
 * 2. Cuánto falta, cuando se puede saber (progreso n/total).
 * 3. Que NO hay que cerrar ni recargar — y esto se vuelve más explícito a
 *    medida que pasa el tiempo, que es cuando aparece la tentación.
 */

type ProgresoOverlayProps = {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  /** Progreso determinado. Si se omite, solo se muestra el cronómetro. */
  progreso?: { hechos: number; total: number };
};

/** A partir de acá se refuerza el mensaje de "no cierres". Son los umbrales
 * donde una espera empieza a sentirse como algo roto. */
const SEGUNDOS_PACIENCIA = 15;
const SEGUNDOS_INSISTIR = 45;

/** El wrapper existe para que el contenido se MONTE recién cuando se abre: así
 * el cronómetro arranca en cero por construcción, sin resetear estado a mano
 * cada vez que la operación termina. */
export function ProgresoOverlay(props: ProgresoOverlayProps) {
  if (!props.abierto) return null;
  return <ContenidoOverlay {...props} />;
}

function ContenidoOverlay({
  titulo,
  descripcion,
  progreso,
}: ProgresoOverlayProps) {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    // Contra el reloj y no sumando de a uno: si el celular se bloquea o la
    // pestaña pasa a segundo plano, el navegador estrangula los timers y un
    // contador incremental quedaría atrasado justo cuando más importa.
    const inicio = Date.now();
    const id = setInterval(
      () => setSegundos(Math.floor((Date.now() - inicio) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  // Bloqueamos el scroll del fondo: en mobile, poder scrollear la tabla que
  // está por detrás da la sensación de que la pantalla sigue disponible.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  // Freno nativo del navegador si intentan cerrar la pestaña o recargar en el
  // medio. Es la protección que faltaba: la aprobación muta stock y precios, y
  // recargar a mitad de camino deja a quien lo hizo sin saber si impactó.
  useEffect(() => {
    const alSalir = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Los navegadores modernos ignoran el texto y muestran el suyo, pero
      // asignar returnValue sigue siendo lo que dispara el diálogo.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  const porcentaje =
    progreso && progreso.total > 0
      ? Math.round((progreso.hechos / progreso.total) * 100)
      : null;

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />

        <h2 className="mt-4 text-lg font-semibold text-foreground">{titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>

        {porcentaje !== null && progreso && (
          <div className="mt-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-medium tabular-nums text-foreground">
              {progreso.hechos} de {progreso.total}
            </p>
          </div>
        )}

        <p className="mt-4 text-xs tabular-nums text-muted-foreground">
          Transcurrido: {mmss}
        </p>

        {segundos >= SEGUNDOS_PACIENCIA && (
          <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            {segundos >= SEGUNDOS_INSISTIR
              ? "Sigue funcionando. Los remitos grandes tardan más. No cierres ni recargues esta pantalla: si lo hacés, no vas a saber si el stock llegó a impactarse."
              : "Esto puede tardar en remitos con muchos renglones. No cierres ni recargues la pantalla."}
          </p>
        )}
      </div>
    </div>
  );
}
