import { createClient } from "@/shared/config/supabase/client";
import { esErrorDeRed } from "@/shared/lib/error-de-red";
import type { ProductoOptimizado } from "@/shared/utils/image-optimizer";
import {
  CACHE_CONTROL_IMAGEN,
  construirPathsImagen,
  esMainUsable,
  type UrlsImagenesProducto,
} from "./imagenes-producto-comun";

/**
 * Sube las imágenes de un producto DESDE EL NAVEGADOR, directo a Storage.
 *
 * POR QUÉ EXISTE
 * Antes las fotos viajaban navegador → Server Action (Vercel) → Storage, todas
 * juntas, en el MISMO POST que guardaba el producto. Eso hacía que el guardado
 * fuera un todo-o-nada que no se puede reanudar: en el celular de la dueña de
 * Evens, con datos móviles, ese POST se moría y se perdía el formulario entero
 * y las fotos ya elegidas.
 *
 * Subiendo directo:
 *  - cada archivo es su propio request, así que una falla no arrastra al resto;
 *  - el reintento es SEGURO, porque el path se calcula una vez y se sube con
 *    `upsert` — reintentar pisa el mismo objeto en vez de duplicarlo;
 *  - lo que después viaja a la Server Action son URLs (unos cientos de bytes),
 *    o sea que el guardado del producto casi no puede fallar por red.
 *
 * Las policies de Storage ya permitían esto sin cambios: `authenticated` puede
 * INSERT en `productos` mientras la primera carpeta del path sea su
 * `current_negocio_id()`. El aislamiento entre negocios lo sigue haciendo la
 * base, no este archivo — acá `negocioId` solo arma la ruta, y si mintiera, la
 * policy rechaza la subida.
 *
 * ALINEACIÓN: `mains[i]`, `thumbs[i]`, `grids[i]` y `masters[i]` son siempre la
 * misma foto. El main manda: si no sube, se descarta el juego entero (no hay
 * imagen que mostrar). Si sube el main pero falla su thumb o su grid, se usa la
 * URL del main como placeholder. El master NUNCA cae al placeholder: si no
 * está, queda `null` — poner el main sería mentir sobre qué se puede
 * regenerar.
 */

/** Reintentos por archivo ante fallo de RED. Un error de permisos o de tamaño
 * no se reintenta: reintentar algo que la base ya rechazó es quemar datos del
 * celular para llegar al mismo lugar. */
const REINTENTOS_POR_ARCHIVO = 2;

/** Espera creciente entre reintentos. Corta a propósito: hay alguien esperando
 * frente al mostrador, no es un job de fondo. */
const ESPERA_MS = [400, 1200];

export type ProgresoSubida = {
  /** Archivos terminados (con éxito o descartados). */
  subidos: number;
  total: number;
};

async function esperar(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Sube un archivo reintentando solo si el fallo fue de red.
 *
 * `upsert: true` es lo que hace idempotente al reintento: el path ya está
 * decidido antes del primer intento, así que el segundo pisa el mismo objeto.
 * Sin eso, un reintento chocaría con "Duplicate" o dejaría basura.
 */
async function subirConReintento(
  supabase: ReturnType<typeof createClient>,
  path: string,
  file: File,
): Promise<{ error: unknown | null }> {
  let ultimoError: unknown = null;

  for (let intento = 0; intento <= REINTENTOS_POR_ARCHIVO; intento++) {
    const { error } = await supabase.storage
      .from("productos")
      .upload(path, file, { cacheControl: CACHE_CONTROL_IMAGEN, upsert: true });

    if (!error) return { error: null };

    ultimoError = error;
    if (!esErrorDeRed(error) || intento === REINTENTOS_POR_ARCHIVO) break;

    await esperar(ESPERA_MS[intento] ?? 1200);
  }

  return { error: ultimoError };
}

export async function subirImagenesProductoDesdeCliente(
  negocioId: string,
  optimizadas: ProductoOptimizado[],
  cupoDisponible: number,
  onProgreso?: (progreso: ProgresoSubida) => void,
): Promise<UrlsImagenesProducto> {
  const supabase = createClient();
  const publicUrl = (path: string) =>
    supabase.storage.from("productos").getPublicUrl(path).data.publicUrl;

  const mains: string[] = [];
  const thumbs: string[] = [];
  const grids: string[] = [];
  const masters: (string | null)[] = [];

  const total = optimizadas.length;
  let procesadas = 0;

  for (const juego of optimizadas) {
    // El cupo se cuenta sobre lo que EFECTIVAMENTE subió, no sobre el índice:
    // una imagen descartada no debe consumir lugar.
    if (mains.length >= cupoDisponible) break;

    // Se capturan ANTES del guard: adentro del `if`, TypeScript ya redujo
    // `juego.main` a `never` y no se le puede leer ni el nombre.
    const nombreMain = juego.main?.name;
    const bytesMain = juego.main?.size;

    if (!esMainUsable(juego.main)) {
      console.error("[UPLOAD CLIENTE] Main descartado por tamaño", {
        archivo: nombreMain,
        bytes: bytesMain,
      });
      procesadas++;
      onProgreso?.({ subidos: procesadas, total });
      continue;
    }

    const paths = construirPathsImagen(
      negocioId,
      {
        main: juego.main,
        thumb: juego.thumbnail,
        grid: juego.grid,
        master: juego.master,
      },
      crypto.randomUUID(),
    );

    // Las cuatro versiones de UNA foto van juntas: son requests independientes
    // y en serie sumarían cuatro round-trips por imagen. Las fotos entre sí
    // siguen yendo de a una, para no abrir demasiadas conexiones desde un
    // celular con mala señal.
    const [mainRes, thumbRes, gridRes, masterRes] = await Promise.all([
      subirConReintento(supabase, paths.main, juego.main),
      paths.thumb
        ? subirConReintento(supabase, paths.thumb, juego.thumbnail)
        : Promise.resolve({ error: null }),
      paths.grid
        ? subirConReintento(supabase, paths.grid, juego.grid)
        : Promise.resolve({ error: null }),
      paths.master
        ? subirConReintento(supabase, paths.master, juego.master)
        : Promise.resolve({ error: null }),
    ]);

    procesadas++;
    onProgreso?.({ subidos: procesadas, total });

    if (mainRes.error) {
      console.error("[UPLOAD CLIENTE] No subió el main", {
        path: paths.main,
        error: mainRes.error,
      });
      // Sin main no hay juego: se descartan también sus derivadas aunque hayan
      // subido, para no dejar un índice sin imagen principal.
      continue;
    }

    const mainUrl = publicUrl(paths.main);
    mains.push(mainUrl);
    thumbs.push(
      paths.thumb && !thumbRes.error ? publicUrl(paths.thumb) : mainUrl,
    );
    grids.push(paths.grid && !gridRes.error ? publicUrl(paths.grid) : mainUrl);
    masters.push(
      paths.master && !masterRes.error ? publicUrl(paths.master) : null,
    );
  }

  return { mains, thumbs, grids, masters };
}
