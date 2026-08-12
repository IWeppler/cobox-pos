"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // Abajo al medio: es donde mira la vendedora después de tocar "Cobrar",
      // no la esquina. En la esquina derecha el aviso de "venta registrada"
      // pasaba desapercibido y se cobraba dos veces.
      position="bottom-center"
      // Apilados abiertos, no como mazo de cartas: cuando un import deja tres
      // avisos seguidos hay que poder leer los tres.
      expand
      visibleToasts={4}
      // 4s alcanzaban para un "listo", no para leer un error con motivo.
      duration={5000}
      gap={10}
      closeButton
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-5" />
        ),
        info: (
          <InfoIcon className="size-5" />
        ),
        warning: (
          <TriangleAlertIcon className="size-5" />
        ),
        error: (
          <OctagonXIcon className="size-5" />
        ),
        loading: (
          <Loader2Icon className="size-5 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "24rem",
        } as React.CSSProperties
      }
      toastOptions={{
        // El resto del estilo (tamaño, sombra, franja de color por tipo) vive
        // en globals.css: sonner inyecta su CSS en runtime y le gana los
        // empates de especificidad a las utilidades de Tailwind.
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
