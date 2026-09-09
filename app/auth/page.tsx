// app/auth/page.tsx
import { AuthPanel } from "@/features/auth/ui/auth-panel";
import Link from "next/link";
import Image from "next/image";
import { PanelVisualAuth } from "@/features/auth/ui/panel-visual";

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

        {/* Sin Suspense acá. La boundary vive ADENTRO de `AuthPanel`,
            alrededor del formulario, que es lo único que lee `?error=` con
            `useSearchParams()`. Envolviendo todo el panel con
            `fallback={null}`, cualquier demora en hidratar dejaba la pantalla
            vacía —en mobile, entera— en vez de mostrar la marca y un
            esqueleto. Ver el comentario en `auth-panel.tsx`. */}
        <AuthPanel />

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

      {/* Mitad derecha: vive en features/auth/ui/panel-visual.tsx porque la
          comparte con /onboarding — son dos pantallas que tienen que verse
          como la misma cosa. */}
      <PanelVisualAuth />
    </div>
  );
}
