'use server';

import { createClient } from '@/shared/config/supabase/server';
import {
  COOKIE_IMPERSONATE,
  COOKIE_NEGOCIO_ACTIVO,
} from '@/shared/lib/negocio-activo';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function logoutAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  await supabase.auth.signOut();

  // El negocio activo (y el modo dios) son de la sesión que se acaba de
  // cerrar, pero su cookie dura 30 días: sin este borrado sobrevive al
  // logout y el server sigue mandando `x-negocio-activo` de alguien que ya
  // no está logueado. No abre nada —la base valida la membresía— pero deja
  // a `leerConfigPos` consultando `configuracion_pos` como `anon`, que no
  // tiene GRANT sobre `modo_caja`: eso es el `[CONFIG] ... 42501` que
  // aparecía en los logs en cada visita a /auth después de salir.
  cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);
  cookieStore.delete(COOKIE_IMPERSONATE);

  redirect('/auth');
}
