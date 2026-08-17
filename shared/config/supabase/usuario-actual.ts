import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "./server";

/**
 * El usuario de la sesión, UNA sola vez por request.
 *
 * `auth.getUser()` no lee la cookie y listo: valida el token contra la API de
 * Auth de Supabase, o sea que es una llamada de red. Y se estaba haciendo dos
 * veces por pantalla del panel — el layout del dashboard la hace, y después
 * CADA página abajo la vuelve a hacer por su cuenta, en el mismo render.
 *
 * `cache()` de React deduplica dentro de ese render: la primera la paga y la
 * segunda es gratis. No cambia nada de la seguridad, porque no reemplaza
 * `getUser()` por `getSession()` (que no verifica la firma del token): sigue
 * siendo la misma validación, hecha una vez en vez de dos.
 *
 * NO sirve para el `getUser()` del middleware: ese corre en otra ejecución,
 * antes del render, y no comparte el caché. Pasar el usuario desde el
 * middleware por un header ahorraría esa tercera llamada, pero convertiría una
 * cabecera de request en la fuente de la identidad — y el aislamiento de este
 * sistema es la sesión y la RLS, no lo que diga un header.
 *
 * Solo para Server Components. Las server actions son otro request y vuelven a
 * validar, que es lo correcto: cada una es su propia puerta.
 */
export const getUsuarioActual = cache(async () => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user: user ?? null, error: error ?? null };
});
