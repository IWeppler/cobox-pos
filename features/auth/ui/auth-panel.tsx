"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { LoginForm } from "./login-form";
import { SolicitudComercioForm } from "./solicitud-comercio-form";

type Modo = "login" | "registro";

/**
 * Login y alta de comercio en la misma pantalla.
 *
 * Se alterna con estado en vez de navegar a otra ruta: quien está por dejar
 * sus datos no pierde de vista dónde está, y volver al login es un click sin
 * recarga.
 */
export function AuthPanel() {
  const [modo, setModo] = useState<Modo>("login");

  const esLogin = modo === "login";

  return (
    <div className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto space-y-8 mt-16 lg:mt-0">
      <div className="flex flex-col space-y-2 text-center lg:text-left">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {esLogin ? "Iniciar sesión" : "Creá tu comercio"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {esLogin
            ? "Ingresá tus credenciales para acceder a tu panel."
            : "Dejanos tus datos y te contactamos para dejarlo funcionando."}
        </p>
      </div>

      {esLogin ? (
        <LoginForm />
      ) : (
        <SolicitudComercioForm onVolver={() => setModo("login")} />
      )}

      <div className="text-center lg:text-left flex">
        {esLogin ? (
          <>
            <p className="text-sm text-muted-foreground pr-1">
              ¿Todavía no tenés un comercio?{" "}
            </p>
            <button
              type="button"
              onClick={() => setModo("registro")}
              className="text-sm font-semibold text-primary inline-flex items-center gap-1 cursor-pointer"
            >
              Crear mi comercio
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground pr-1">
              ¿Ya tenés cuenta?{" "}
            </p>
            <button
              type="button"
              onClick={() => setModo("login")}
              className="text-sm font-semibold text-primary transition-colors cursor-pointer"
            >
              Iniciar sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
