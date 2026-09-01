'use server';

import { createClient } from '@/shared/config/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { invalidarCatalogoDeSesion } from '@/shared/lib/cache-catalogo';

export async function togglePublicadoAction(id: string, publicado: boolean) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
      .from('productos')
      .update({ publicado })
      .eq('id', id);

    if (error) {
      console.error(error);
      return { error: 'Error al cambiar visibilidad.', success: false };
    }

    revalidatePath('/stock');
    // `"layout"` y no la ruta sola: el catálogo se dibuja abajo del layout de
    // /store, y sin el segundo argumento el segmento cacheado de arriba
    // sobrevive. Es la misma llamada que hace el hermano masivo
    // (bulkTogglePublicadoAction), que hasta ahora era el único de los dos que
    // limpiaba bien.
    revalidatePath('/store', 'layout');
    // Y esto es lo que faltaba de verdad: `revalidatePath` no toca una entrada
    // de `unstable_cache`, y el catálogo público sale de una
    // (getProductosPublicosCacheados). Sin el tag, ocultar un producto lo
    // dejaba a la venta en la vidriera hasta que venciera el TTL de 60s —
    // justo el caso que el comentario de cache-catalogo.ts describe como "la
    // dueña no lo ve y asume que se rompió".
    await invalidarCatalogoDeSesion(supabase);

    return { error: null, success: true };
  } catch (err) {
    console.error('Error in togglePublicadoAction:', err);
    return { error: 'Ocurrió un error inesperado.', success: false };
  }
}
