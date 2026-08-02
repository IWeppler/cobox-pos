// app/auth/page.tsx
import { AuthPanel } from "@/features/auth/ui/auth-panel";
import Image from "next/image";
import { Suspense } from "react";

export default function AuthPage() {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* PANEL IZQUIERDO — FORMULARIO (Se mantiene intacto) */}
      <div className="flex flex-col relative px-8 sm:px-16 py-12 lg:py-8 bg-card border-r border-border/50">
        
        {/* Logo Superior Izquierdo */}
        <div className="absolute top-8 left-8 sm:top-12 sm:left-12 flex items-center gap-3">
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

        {/* Contenedor del Formulario Centrado. El panel alterna entre login y
            alta de comercio sin cambiar de ruta; el de login lee ?error= de la
            URL, así que necesita Suspense. */}
        <Suspense fallback={null}>
          <AuthPanel />
        </Suspense>

        {/* Footer */}
        <p className="absolute bottom-8 left-0 right-0 text-xs font-medium text-muted-foreground text-center">
          © {new Date().getFullYear()} Comerz POS. Todos los derechos reservados.
        </p>
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
          style={{ backgroundImage: 'url("/noise.svg")', backgroundRepeat: 'repeat' }}
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
                src="/auth.png"
                alt="Dashboard Principal"
                width={1600}
                height={1000}
                className="w-full h-auto object-cover"
              />
            </div>

            {/* Mockup de Adelante (auth1.png) - Tamaño 130% desplazado hacia abajo */}
            <div className="absolute left-[15%] top-[40%] w-[130%] rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden transform transition-transform duration-700 hover:-translate-y-2 z-20">
              <Image
                src="/auth1.png"
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