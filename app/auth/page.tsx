// app/auth/page.tsx
import { AuthPanel } from "@/features/auth/ui/auth-panel";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";

export default function AuthPage() {
  return (
    <div className="min-h-svh grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* PANEL IZQUIERDO — FORMULARIO.
          `group` es lo que hace funcionar el modo teclado: en mobile, cuando
          algo del panel toma foco (o sea, cuando se abre el teclado), el
          header se achica con transición en vez de que el formulario quede
          empujado abajo de la pantalla. Es CSS puro: no hay que adivinar la
          altura del teclado ni escuchar visualViewport. */}
      <div className="group flex flex-col relative px-6 sm:px-16 py-10 lg:py-8 bg-card lg:border-r border-border/50">
        {/* Logo — desktop: arriba a la izquierda, como estaba */}
        <div className="hidden lg:flex absolute top-8 left-8 sm:top-12 sm:left-12 items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <Image
              src="/logow.png"
              alt="Logo"
              width={36}
              height={36}
              className="object-contain rounded"
            />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">
            Comerz
          </span>
        </div>

        {/* En mobile la marca (logo + slogan) va adentro del panel: el slogan
            cambia según se esté entrando o creando un comercio, y ese estado
            vive en AuthPanel. */}

        {/* Contenedor del Formulario Centrado. El panel alterna entre login y
            alta de comercio sin cambiar de ruta; el de login lee ?error= de la
            URL, así que necesita Suspense. */}
        <Suspense fallback={null}>
          <AuthPanel />
        </Suspense>

       <div className="mt-8 text-center space-y-3">
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground/80">
          Al continuar, aceptás nuestros{" "}
          <Link
            href="/terminos"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Términos y Condiciones
          </Link>{" "}
          y reconocés haber leído nuestra{" "}
          <Link
            href="/privacidad"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Política de Privacidad
          </Link>
          .
        </p>

        <p className="text-[11px] text-muted-foreground/60">
          © {new Date().getFullYear()} Comerz. Todos los derechos
          reservados.
        </p>
      </div>
      </div>

      {/* PANEL DERECHO — BRANDING VISUAL (Actualizado) */}
      <div className="hidden lg:flex relative flex-col overflow-hidden">
        {/* Imagen de Fondo Original */}
        <Image
          src="/splash-backdrop.webp"
          alt="Background"
          fill
          className="object-cover z-0 opacity-90"
          priority
        />

        {/* Capa de oscurecimiento */}
        <div className="absolute inset-0 bg-[#0a2342]/40 z-0" />

        {/* Nueva Capa de Ruido (Noise overlay) */}
        <div
          className="absolute inset-0 z-0 opacity-30 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: 'url("/noise.svg")',
            backgroundRepeat: "repeat",
          }}
        />

        {/* Contenido */}
        <div className="relative z-10 w-full h-full flex flex-col pt-24 pl-16">
          {/* Título Estilo Sanity */}
          <h2 className="text-5xl font-medium text-white tracking-tight leading-[1.1] max-w-xl">
            Gestión comercial inteligente en tiempo real
          </h2>

          {/* Contenedor de Mockups (Tamaños masivos para tapar el fondo) */}
          <div className="relative flex-1 mt-16 w-full">
            {/* Mockup de Atrás (auth.png) - Tamaño 140% para desbordar la pantalla */}
            <div className="absolute left-0 top-8 w-[140%] rounded-xl shadow-2xl border border-white/10 overflow-hidden transform transition-transform duration-700 hover:-translate-y-2 z-10">
              <Image
                src="/auth2.webp"
                alt="Dashboard Principal"
                width={1600}
                height={1000}
                className="w-full h-auto object-cover"
              />
            </div>

            {/* Mockup de Adelante (auth1.png) - Tamaño 130% desplazado hacia abajo */}
            <div className="absolute left-[15%] top-[40%] w-[130%] rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden transform transition-transform duration-700 hover:-translate-y-2 z-20">
              <Image
                src="/auth1.webp"
                alt="Detalle Dashboard"
                width={1600}
                height={1000}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
