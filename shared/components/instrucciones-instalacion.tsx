"use client";

import { Share, Plus, Compass, MoreVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { MetodoInstalacion } from "@/shared/lib/pwa-instalacion";

/**
 * Explica cómo instalar cuando el navegador no ofrece un botón.
 *
 * Son dos casos distintos y conviene no mezclarlos: en Safari de iOS se puede
 * instalar pero hay que hacerlo a mano, y adentro de WhatsApp o Instagram no
 * se puede instalar en absoluto hasta abrir el link en el navegador de verdad.
 */
export function InstruccionesInstalacion({
  metodo,
  abierto,
  onAbiertoChange,
}: Readonly<{
  metodo: MetodoInstalacion;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}>) {
  if (metodo.tipo !== "ios-manual" && metodo.tipo !== "abrir-en-navegador") {
    return null;
  }

  const enIOS =
    metodo.tipo === "ios-manual" ||
    (metodo.tipo === "abrir-en-navegador" && metodo.navegador === "safari");

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Instalar Comerz en tu teléfono</DialogTitle>
          <DialogDescription>
            {metodo.tipo === "ios-manual"
              ? "Tu navegador no tiene un botón de instalar, pero se puede agregar a la pantalla de inicio en tres pasos."
              : "Estás viendo la app dentro de otra aplicación, y desde acá no se puede instalar."}
          </DialogDescription>
        </DialogHeader>

        {metodo.tipo === "ios-manual" ? (
          <ol className="space-y-4">
            <Paso numero={1} icono={<Share className="w-4 h-4" />}>
              Tocá el botón <strong>Compartir</strong>, abajo en el centro de la
              barra de Safari.
            </Paso>
            <Paso numero={2} icono={<Plus className="w-4 h-4" />}>
              Deslizá la lista hacia abajo y elegí{" "}
              <strong>Agregar a inicio</strong>.
            </Paso>
            <Paso numero={3} icono={<Compass className="w-4 h-4" />}>
              Confirmá con <strong>Agregar</strong>. El ícono de Comerz te queda
              en la pantalla de inicio, como cualquier otra app.
            </Paso>
          </ol>
        ) : (
          <ol className="space-y-4">
            <Paso
              numero={1}
              icono={
                enIOS ? (
                  <Share className="w-4 h-4" />
                ) : (
                  <MoreVertical className="w-4 h-4" />
                )
              }
            >
              Tocá el menú de esta pantalla{" "}
              {enIOS ? "(el botón Compartir)" : "(los tres puntos, arriba a la derecha)"}
              .
            </Paso>
            <Paso numero={2} icono={<Compass className="w-4 h-4" />}>
              Elegí{" "}
              <strong>
                {enIOS ? "Abrir en Safari" : "Abrir en Chrome"}
              </strong>
              .
            </Paso>
            <Paso numero={3} icono={<Plus className="w-4 h-4" />}>
              Ya en el navegador, volvé a tocar Instalar y seguí los pasos.
            </Paso>
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Paso({
  numero,
  icono,
  children,
}: Readonly<{
  numero: number;
  icono: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <li className="flex gap-3 items-start">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold text-sm">
        {numero}
      </span>
      <p className="text-sm text-muted-foreground leading-snug pt-1.5">
        <span className="inline-flex items-center align-middle mr-1.5 text-foreground">
          {icono}
        </span>
        {children}
      </p>
    </li>
  );
}
