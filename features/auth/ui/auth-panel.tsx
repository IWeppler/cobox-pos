"use client";

import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./login-form";

/**
 * Panel de /auth: SOLO login.
 *
 * Antes alternaba entre entrar y un formulario de "dejanos tus datos" que
 * escribía en `solicitudes_comercio` y esperaba un WhatsApp de Comerz. Ese
 * camino se fue: el alta ahora es self-service y vive en /onboarding, que es
 * ruta propia porque es el paso más largo del producto y no puede quedar
 * escondido detrás de un toggle en la pantalla de login.
 *
 * Acá quedó "Crear cuenta" como link, no como cambio de modo: /auth es para el
 * que ya tiene cuenta, y mezclar las dos cosas obligaba a decidir "¿entro o me
 * registro?" antes de saber de qué se trata.
 */
export function AuthPanel() {
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
          <span className="block">Todo tu negocio.</span>
          <span className="block">En un solo lugar.</span>
        </p>
      </div>

      <div className="lg:hidden h-px w-full bg-border/60 my-7 transition-all duration-300 ease-out group-focus-within:my-5" />

      <div className="flex flex-col text-center lg:text-left">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Ingresá a tu comercio
        </h1>

        <p className="text-sm text-muted-foreground mt-2 max-h-16 overflow-hidden transition-all duration-300 ease-out max-lg:group-focus-within:max-h-0 max-lg:group-focus-within:mt-0 max-lg:group-focus-within:opacity-0">
          Ingresá tus credenciales para acceder a tu panel.
        </p>
      </div>

      <div className="mt-8">
        <LoginForm />
      </div>

      {/* Pregunta y acción van en un mismo párrafo: como flex se partían en
          dos líneas en pantallas angostas. */}
      <div className="mt-8 space-y-3 text-center lg:text-left">
        <p className="text-sm text-muted-foreground">
          ¿Todavía no tenés un comercio?{" "}
          <Link
            href="/onboarding"
            className="font-semibold text-primary underline-offset-4 hover:underline transition-colors"
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
