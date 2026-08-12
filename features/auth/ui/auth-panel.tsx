"use client";

import { useState } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { SolicitudComercioForm } from "./solicitud-comercio-form";
import { RegistroForm } from "./registro-form";

type Modo = "login" | "registro";

/** El slogan acompaña al modo: no es lo mismo volver a entrar que empezar. */
const SLOGAN: Record<Modo, readonly [string, string]> = {
  login: ["Todo tu negocio.", "En un solo lugar."],
  registro: ["Empezá con Comerz.", "Tu comercio, más simple."],
};

export function AuthPanel() {
  const [modo, setModo] = useState<Modo>("login");

  const esLogin = modo === "login";
  const [sloganL1, sloganL2] = SLOGAN[modo];

  return (
    <div className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto lg:mt-0">
      {/* MARCA — solo mobile. Logo y slogan forman un bloque propio, separado
          del formulario por una línea: arriba quién sos, abajo qué hacés. En
          desktop la marca vive arriba a la izquierda de la página. */}
      <div className="lg:hidden flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center transition-all duration-300 ease-out group-focus-within:w-11 group-focus-within:h-11">
          <Image
            src="/logow.png"
            alt="Comerz"
            width={56}
            height={56}
            className="w-full h-full object-contain rounded-2xl p-2"
          />
        </div>
        <span className="mt-3 text-xl font-bold tracking-tight text-foreground transition-all duration-300 ease-out group-focus-within:mt-2 group-focus-within:text-lg">
          Comerz
        </span>
        {/* Dos líneas a propósito, y colapsa con el teclado abierto. */}
        <p className="mt-1.5 max-h-16 overflow-hidden text-sm leading-snug text-muted-foreground transition-all duration-300 ease-out group-focus-within:mt-0 group-focus-within:max-h-0 group-focus-within:opacity-0">
          <span className="block">{sloganL1}</span>
          <span className="block">{sloganL2}</span>
        </p>
      </div>

      <div className="lg:hidden h-px w-full bg-border/60 my-7 transition-all duration-300 ease-out group-focus-within:my-5" />

      <div className="flex flex-col text-center lg:text-left">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {esLogin ? "Ingresá a tu comercio" : "Creá tu comercio"}
        </h1>
        
        <p className="text-sm text-muted-foreground mt-2 max-h-16 overflow-hidden transition-all duration-300 ease-out max-lg:group-focus-within:max-h-0 max-lg:group-focus-within:mt-0 max-lg:group-focus-within:opacity-0">
          {esLogin
            ? "Ingresá tus credenciales para acceder a tu panel."
            : "Creá tu cuenta y empezá con 14 días de prueba."}
        </p>
      </div>

      <div className="mt-8">
        {/* El modo "registro" era un formulario de contacto: escribía en
            `solicitudes_comercio` y Comerz respondía por WhatsApp. Ahora crea
            la cuenta de verdad y sigue solo hasta /crear-negocio, donde elige
            plan. El formulario de contacto sigue existiendo
            (SolicitudComercioForm) para quien prefiera que lo llamen. */}
        {esLogin ? <LoginForm /> : <RegistroForm onVolver={() => setModo("login")} />}
      </div>

      {/* Pregunta y acción van en un mismo párrafo: como flex se partían en
          dos líneas en pantallas angostas. */}
      <div className="mt-8 space-y-3 text-center lg:text-left">
        <p className="text-sm text-muted-foreground">
          {esLogin ? "¿Todavía no tenés un comercio? " : "¿Ya tenés cuenta? "}
          <button
            type="button"
            onClick={() => setModo(esLogin ? "registro" : "login")}
            className="font-semibold text-primary underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            {esLogin ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </p>
      </div>
    </div>
  );
}
