import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";

/**
 * "No quiero recibir más mails", desde el pie de cualquier campaña.
 *
 * Pública y sin sesión: quien abre este link es alguien que recibió un mail,
 * no alguien que está usando la app. Lo que lo protege es el id del envío —un
 * uuid aleatorio que solo está en ESE mail—, y la dirección que se da de baja
 * sale de la fila, nunca de la URL: no se puede dar de baja la casilla de otro.
 *
 * La baja se ejecuta al ABRIR, sin botón de confirmar. Es a propósito: el
 * costo de equivocarse es que alguien deje de recibir mails que no quería, y
 * el costo de pedirle un click más es que la baja no se complete y el próximo
 * mail lo marque como spam. Volver a recibirlos es pedirlo por WhatsApp.
 */
export const metadata = { title: "Baja de mails · Comerz" };

// Escribe en la base: no se puede cachear ni prerenderizar.
export const dynamic = "force-dynamic";

export default async function BajaMailsPage({
  params,
}: Readonly<{ params: Promise<{ envioId: string }> }>) {
  const { envioId } = await params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: email, error } = await supabase.rpc("dar_de_baja_mails", {
    p_envio_id: envioId,
  });

  if (error) console.error("[BAJA MAILS]", error);

  // `null` = ese envío no existe. Puede ser un link viejo de una fila borrada,
  // o alguien probando uuids. Las dos cosas se contestan igual y sin decir si
  // el id existía: acá no hay nada que enumerar.
  const dadoDeBaja = !error && typeof email === "string" && email.length > 0;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold">
          {dadoDeBaja ? "Listo, no te escribimos más" : "No pudimos darte de baja"}
        </h1>

        <p className="text-sm text-muted-foreground">
          {dadoDeBaja ? (
            <>
              Sacamos <span className="font-medium">{email}</span> de nuestra
              lista. No vas a recibir más mails de Comerz.
            </>
          ) : (
            <>
              Este link no es válido o ya venció. Escribinos a{" "}
              <a href="https://wa.me/541154702118" className="underline">
                +54 11 5470 2118
              </a>{" "}
              y lo resolvemos.
            </>
          )}
        </p>

        {dadoDeBaja && (
          <p className="text-xs text-muted-foreground">
            Los mails de tu cuenta —confirmación y recuperación de contraseña—
            siguen llegando: son los que necesitás para poder entrar.
          </p>
        )}
      </div>
    </main>
  );
}
