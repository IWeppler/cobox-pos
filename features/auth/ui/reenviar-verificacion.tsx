"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { enviarVerificacionEmailAction } from "@/features/auth/actions/verificacion-email";
import { SEGUNDOS_ENTRE_ENVIOS } from "@/features/auth/lib/verificacion-email";

/**
 * Botón para volver a pedir el mail de verificación.
 *
 * Faltaba justamente donde más se necesita: la pantalla "Revisá tu correo" no
 * ofrecía ninguna salida. Si el mail no llegaba —spam, dirección mal tipeada,
 * el SMTP demorado— la única opción era registrarse de nuevo con otro mail, o
 * abandonar.
 *
 * El cooldown no es cosmético: el SMTP por defecto de Supabase permite muy
 * pocos mensajes por hora, y dos clicks seguidos dejan a la persona sin poder
 * verificar durante un rato largo.
 */
export function ReenviarVerificacion({
  email,
  variant = "outline",
  className,
}: Readonly<{
  email: string;
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
}>) {
  const [pendiente, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  const enviar = () => {
    startTransition(async () => {
      const res = await enviarVerificacionEmailAction(email);
      setMensaje(res.mensaje);
      // El cooldown corre también si falló: el motivo más común de falla ES el
      // límite de envíos, y reintentar en el acto lo empeora.
      setEspera(SEGUNDOS_ENTRE_ENVIOS);
    });
  };

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        onClick={enviar}
        disabled={pendiente || espera > 0 || !email}
        className="h-9"
      >
        {pendiente ? (
          <Loader2 className="size-4 animate-spin" />
        ) : espera > 0 ? (
          `Reenviar en ${espera}s`
        ) : (
          "Reenviar correo"
        )}
      </Button>

      {mensaje && (
        <p className="mt-2 text-xs text-muted-foreground">{mensaje}</p>
      )}
    </div>
  );
}
