import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/config/supabase/server";
import { OnboardingStepper } from "@/features/auth/ui/onboarding-stepper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Empezá con Comerz",
  description: "Creá tu comercio y empezá a vender en minutos.",
};

/**
 * Alta de comercio, de punta a punta. Reemplaza a /crear-negocio y al
 * formulario de "dejanos tus datos" del login, que eran dos mitades del mismo
 * camino: uno pedía contacto y esperaba un WhatsApp, el otro exigía una cuenta
 * que no había forma de crear.
 *
 * Es ruta propia y no un modo de /auth a propósito: /auth es para el que YA
 * tiene cuenta. Meter el alta ahí obligaba a decidir "¿entro o me registro?"
 * antes de saber de qué se trata, y dejaba el paso más largo del producto
 * escondido detrás de un link chico.
 */
export default async function OnboardingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Con sesión Y negocio esto no tiene nada que ofrecer: adentro. Es el caso
  // de quien vuelve al link por costumbre o desde un mail viejo.
  if (user) {
    const { count } = await supabase
      .from("usuarios_negocios")
      .select("negocio_id", { count: "exact", head: true })
      .eq("usuario_id", user.id);

    if ((count ?? 0) > 0) redirect("/");
  }

  return (
    <main className="min-h-svh bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-md space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
            <Image
              src="/logow.png"
              alt=""
              width={36}
              height={36}
              className="rounded object-contain"
            />
          </div>
          <span className="text-lg font-bold tracking-tight">Comerz</span>
        </div>

        {/* `yaAutenticado` es lo que permite retomar: si se registró y abandonó
            antes de crear el negocio, vuelve directo al paso 2 en vez de
            chocarse con un formulario de cuenta que ya completó. */}
        <OnboardingStepper yaAutenticado={Boolean(user)} />

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link
            href="/auth"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
