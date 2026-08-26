"use client";

import { MailWarning } from "lucide-react";
import { ReenviarVerificacion } from "./reenviar-verificacion";
import {
  estadoVerificacionEmail,
  DIAS_PARA_VERIFICAR,
} from "@/features/auth/lib/verificacion-email";

/**
 * El aviso que reemplazó a la puerta de verificación.
 *
 * Antes, verificar el correo era un paso obligatorio EN EL MEDIO del alta:
 * había que salir a la casilla y volver, justo cuando la persona todavía no
 * había visto nada del producto. Ahora entra derecho y la verificación queda
 * como una deuda visible, con su plazo y con el botón para resolverla en el
 * acto.
 *
 * Avisa, no bloquea. Cuando el plazo se vence el tono se endurece, pero sigue
 * sin cortar la operación: quien está vendiendo en el mostrador no puede
 * quedarse afuera del POS por un mail sin confirmar. El día que haga falta
 * cortar de verdad, el corte va acá — con el estado ya calculado.
 */
export function BannerVerificacionEmail({
  email,
  emailConfirmado,
  creadoEn,
}: Readonly<{
  email: string;
  emailConfirmado: boolean;
  creadoEn: string | null;
}>) {
  const estado = estadoVerificacionEmail({ emailConfirmado, creadoEn });

  if (estado.estado === "verificado") return null;

  const vencido = estado.estado === "vencido";

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm ${
        vencido
          ? "border-danger/20 bg-danger/10 text-danger"
          : "border-warning/20 bg-warning/10 text-warning-foreground"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <MailWarning className="size-4 shrink-0" />
        <p className="min-w-0">
          <span className="font-semibold">
            {vencido ? "Verificá tu correo" : "Falta verificar tu correo"}
          </span>{" "}
          <span className="opacity-90">
            {vencido
              ? `Pasaron los ${DIAS_PARA_VERIFICAR} días. Sin verificar ${email} no vas a poder recuperar tu contraseña.`
              : `Te mandamos un mail a ${email}. Te quedan ${estado.diasRestantes} día${
                  estado.diasRestantes === 1 ? "" : "s"
                }.`}
          </span>
        </p>
      </div>

      <ReenviarVerificacion email={email} variant="secondary" />
    </div>
  );
}
