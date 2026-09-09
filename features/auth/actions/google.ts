"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { urlBaseDeLaRequest } from "@/shared/lib/url-base-request";
import {
  GOOGLE_AUTH_HABILITADO,
  urlDeRetornoGoogle,
} from "@/shared/lib/auth-google";
import { COOKIE_NEGOCIO_ACTIVO } from "@/shared/lib/negocio-activo";
import { destinoSeguro } from "@/features/auth/lib/destino-callback";

export interface InicioGoogle {
  /** A dónde mandar el navegador. `null` si no se pudo arrancar. */
  url: string | null;
  error: string;
}

/**
 * Arranca el login con Google y devuelve la URL a la que hay que ir.
 *
 * No redirige desde acá: `signInWithOAuth` en el server devuelve la URL de
 * Google y el cliente la navega. Hacer el redirect del lado del servidor
 * también funciona, pero deja al botón sin forma de mostrar un error si el
 * proveedor no está configurado — que es exactamente lo que pasa el primer día.
 *
 * El flag se vuelve a chequear ACÁ y no solo en el botón: un server action es
 * un endpoint, y esconder el botón no es control de acceso. Mismo criterio que
 * los dos `tiene_permiso` de la importación de planillas.
 */
export async function iniciarConGoogleAction(
  next: string,
): Promise<InicioGoogle> {
  if (!GOOGLE_AUTH_HABILITADO) {
    return { url: null, error: "Entrar con Google todavía no está habilitado." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // La cookie de negocio de una sesión anterior EN ESTE NAVEGADOR apuntaría a
  // un comercio que el que está por entrar puede no integrar. Con el alta por
  // mail lo limpia `registrarseAction`; por acá no pasa nadie, así que se
  // limpia igual. La RLS lo frenaría de todos modos —`current_negocio_id()`
  // valida la membresía— pero dejarla puesta hace que el middleware tenga que
  // descubrirlo, y eso es un rebote evitable.
  cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: urlDeRetornoGoogle(
        await urlBaseDeLaRequest(),
        destinoSeguro(next),
      ),
      queryParams: {
        // Que Google PREGUNTE con cuál cuenta. Sin esto entra con la que ya
        // tenga abierta, y el dueño de un comercio suele tener la personal y
        // la del negocio en el mismo navegador: entrar con la equivocada crea
        // una cuenta de Comerz nueva sin que se note.
        prompt: "select_account",
      },
    },
  });

  if (error || !data?.url) {
    console.error("[GOOGLE AUTH]", error);
    return {
      url: null,
      error: "No pudimos conectar con Google. Probá de nuevo en un rato.",
    };
  }

  return { url: data.url, error: "" };
}
