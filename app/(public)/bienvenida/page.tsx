import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cobox — POS y catálogo online para comercios",
  description:
    "Cobox es el sistema de ventas, caja y catálogo online para comercios.",
};

/**
 * Landing neutra de Cobox. Es lo que se ve en la raíz sin sesión y sin
 * negocio: NO es el catálogo de nadie. Cada tienda vive en su propia URL
 * (evens.cobox.app o /store/evens) y se resuelve por slug.
 */
export default function BienvenidaPage() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-6 sm:px-12 py-6">
        <div className="w-10 h-10 bg-white shadow-sm border border-border rounded-lg flex items-center justify-center">
          <Image
            src="/logow.png"
            alt="Cobox"
            width={28}
            height={28}
            className="object-contain rounded"
          />
        </div>
        <span className="font-bold text-xl tracking-tight">Cobox</span>
      </header>

      <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto px-6 py-16 space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            El sistema de ventas de tu comercio
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Ventas, caja, stock y catálogo online en un solo lugar. Cada
            comercio tiene su propia tienda y sus propios datos.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth"
            className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Ingresar
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          ¿Buscabas la tienda de un comercio? Entrá por su dirección propia: no
          hay un catálogo general de Cobox.
        </p>
      </div>

      <footer className="px-6 sm:px-12 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Cobox
      </footer>
    </main>
  );
}
