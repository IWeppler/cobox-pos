"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  calcularProgresoActivacion,
  type EstadoActivacion,
} from "@/features/onboarding/lib/pasos-activacion";
import { useCajaModalStore } from "@/shared/store/caja-modal-store";

/**
 * Guía de inicio: qué le falta al comercio para empezar a vender.
 *
 * Va arriba de todo en el panel y desaparece sola cuando están los pasos
 * obligatorios — no hay botón de "no mostrar más" ni flag guardado, porque el
 * estado es derivado: el día que la lista se completa deja de aparecer, y si el
 * comercio se queda sin productos vuelve, que es cuando conviene que vuelva.
 *
 * El plegado sí es estado de UI (useState, se pierde al recargar): es para
 * sacarla del camino un rato, no para esconderla para siempre.
 */
export function ChecklistActivacion({
  estado,
}: Readonly<{ estado: EstadoActivacion }>) {
  const [abierta, setAbierta] = useState(true);
  // Un solo paso desplegado por vez: la card vive arriba del panel y no puede
  // empujar todo lo demás fuera de la pantalla.
  const [pasoAbierto, setPasoAbierto] = useState<string | null>(null);
  const abrirCaja = useCajaModalStore((state) => state.abrir);
  const { pasos, completados, total, activado, siguiente } =
    calcularProgresoActivacion(estado);

  // Todo lo obligatorio hecho: el comercio ya vende, la guía no tiene nada que
  // decir. Los opcionales que queden sueltos no la sostienen viva.
  if (activado) return null;

  return (
    <section
      aria-label="Guía de inicio"
      className="rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">
            Primeros pasos
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {siguiente
              ? `Te falta: ${siguiente.titulo.toLowerCase()}.`
              : "Ya casi."}{" "}
            {completados} de {total} listos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          {abierta ? "Ocultar" : "Ver pasos"}
          {abierta ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </div>

      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={completados}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Progreso de la puesta en marcha"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(completados / total) * 100}%` }}
        />
      </div>

      {abierta && (
        <ol className="mt-3 flex flex-col gap-1">
          {pasos.map((paso) => (
            <li
              key={paso.clave}
              className={`rounded-lg px-2 py-2 ${
                paso.hecho ? "opacity-60" : "hover:bg-muted/40"
              }`}
            >
             <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                  paso.hecho
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-transparent"
                }`}
              >
                {paso.hecho ? (
                  <Check className="size-3" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <span className={paso.hecho ? "line-through" : ""}>
                    {paso.titulo}
                  </span>
                  {paso.opcional && !paso.hecho && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      opcional
                    </span>
                  )}
                </p>
                {!paso.hecho && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {paso.detalle}
                  </p>
                )}
                {/* "Cargar productos" son tres caminos distintos según de
                    dónde venga la mercadería, y "abrir caja" no está donde
                    parece. Un link solo no alcanza para eso. */}
                {!paso.hecho && paso.opciones && (
                  <button
                    type="button"
                    onClick={() =>
                      setPasoAbierto((actual) =>
                        actual === paso.clave ? null : paso.clave,
                      )
                    }
                    aria-expanded={pasoAbierto === paso.clave}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    {pasoAbierto === paso.clave
                      ? "Ocultar opciones"
                      : `Ver las ${paso.opciones.length} formas de hacerlo`}
                    <ChevronDown
                      className={`size-3 transition-transform ${
                        pasoAbierto === paso.clave ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                )}
              </div>

              {!paso.hecho &&
                (paso.accion === "abrir-caja" ? (
                  // No navega: abre el modal del navbar, que es el único lugar
                  // donde se abre un turno.
                  <Button
                    size="sm"
                    variant={
                      paso.clave === siguiente?.clave ? "default" : "ghost"
                    }
                    className="h-8 shrink-0"
                    onClick={abrirCaja}
                  >
                    {paso.cta}
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="sm"
                    variant={
                      paso.clave === siguiente?.clave ? "default" : "ghost"
                    }
                    className="h-8 shrink-0"
                  >
                    <Link href={paso.href}>{paso.cta}</Link>
                  </Button>
                ))}
             </div>

              {pasoAbierto === paso.clave && paso.opciones && (
                <ul className="mt-2 ml-8 flex flex-col gap-2 border-l border-border pl-3">
                  {paso.opciones.map((opcion) => (
                    <li key={opcion.titulo}>
                      <p className="text-xs font-medium text-foreground">
                        {opcion.titulo}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {opcion.detalle}
                      </p>
                      {/* Sin href cuando la opción no es una pantalla sino
                          algo que ya está a la vista: mandar a ningún lado es
                          mejor que inventar un destino. */}
                      {opcion.href && (
                        <Link
                          href={opcion.href}
                          className="mt-0.5 inline-block text-[11px] font-medium text-primary hover:underline"
                        >
                          Ir
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
