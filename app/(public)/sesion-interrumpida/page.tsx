import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { RUTA_SALIR } from "@/shared/lib/salir-sesion";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "No pudimos abrir tu negocio | Comerz",
};

/**
 * Destino del REWRITE del middleware cuando no pudo resolver el negocio de la
 * sesión (ver `shared/lib/sesion-interrumpida.ts`).
 *
 * Rewrite y no redirect a propósito: la URL no cambia, así que "Reintentar" es
 * recargar la misma dirección y no hay salto que pueda repetirse en ciclo. Es
 * la diferencia entre esta pantalla y el loop que vino a reemplazar.
 *
 * El texto no dice "error del servidor" ni muestra un código: quien lo lee está
 * en el mostrador con una clienta enfrente. Dice qué pasó y qué hacer.
 */
export default async function SesionInterrumpidaPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  // A dónde volver al reintentar. Solo se acepta un path interno: un `volver`
  // con host propio convertiría esta pantalla en un redirector abierto.
  const { volver } = await searchParams;
  const destino =
    volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";

  return (
    <main className="min-h-svh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            No pudimos abrir tu negocio
          </h1>
          <p className="text-sm text-muted-foreground">
            La conexión con el servidor se cortó justo cuando estábamos viendo a
            qué negocio entrás. No se perdió nada: probá de nuevo.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href={destino}>Reintentar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={RUTA_SALIR}>Salir y volver a entrar</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/70">
          Si vuelve a pasar varias veces seguidas, avisale a quien te da soporte.
        </p>
      </div>
    </main>
  );
}
