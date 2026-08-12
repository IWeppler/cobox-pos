/**
 * Traducción slug -> negocio para el MIDDLEWARE, cacheada en memoria con TTL.
 *
 * El middleware corre en cada request del catálogo (portada, cada producto,
 * cada server action, cada bot que pasa): resolver el slug con una consulta a
 * Supabase por request es una llamada de red antes de empezar a responder, en
 * el camino crítico de la única página que ve un cliente que todavía no compró.
 *
 * Por qué acá y no `shared/lib/tenant.ts`: aquel usa `cache()` de React, que
 * vive UN render, y corre en Node con supabase-js. Este corre en el edge, tiene
 * que sobrevivir entre requests y solo necesita saber si el slug existe, así que
 * pega a PostgREST con `fetch` pelado y no arrastra el cliente entero.
 *
 * El cache es por isolate y se pierde en cada deploy o cuando el edge recicla:
 * es un cache, no una fuente de verdad. Lo peor que puede pasar es servir hasta
 * TTL_OK una tienda recién suspendida — y la RLS sigue siendo el freno real: el
 * middleware decide RUTAS, no permisos.
 */

/** Un slug vivo cambia poco; el precio de un dato viejo es un rewrite de más. */
const TTL_OK_MS = 5 * 60 * 1000;

/**
 * Los negativos caducan más rápido, pero se cachean igual: un slug que no
 * existe es justamente lo que llega en volumen (bots probando subdominios), y
 * sin cachear el miss cada uno se lleva una consulta.
 */
const TTL_MISS_MS = 60 * 1000;

/**
 * Tope de entradas. Sin esto, tráfico automatizado contra subdominios al azar
 * hace crecer el Map sin límite dentro de un isolate de larga vida.
 */
const MAX_ENTRADAS = 500;

interface Entrada {
  negocioId: string | null;
  expira: number;
}

const cache = new Map<string, Entrada>();
/** Consultas en curso, para que una ráfaga sobre el mismo slug pida una vez. */
const enVuelo = new Map<string, Promise<string | null>>();

export type ResolucionTienda =
  | { estado: "existe"; negocioId: string }
  | { estado: "no-existe" }
  /** No se pudo resolver (red, 5xx). NO es lo mismo que no existir. */
  | { estado: "indeterminado" };

function guardar(slug: string, negocioId: string | null) {
  if (cache.size >= MAX_ENTRADAS) {
    const ahora = Date.now();
    for (const [clave, entrada] of cache) {
      if (entrada.expira <= ahora) cache.delete(clave);
    }
    // Si estaban todas vigentes, se saca la más vieja para dejar lugar.
    if (cache.size >= MAX_ENTRADAS) {
      const primera = cache.keys().next();
      if (!primera.done) cache.delete(primera.value);
    }
  }

  cache.set(slug, {
    negocioId,
    expira: Date.now() + (negocioId ? TTL_OK_MS : TTL_MISS_MS),
  });
}

async function consultar(slug: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Faltan las credenciales de Supabase");

  const consulta =
    `${url}/rest/v1/negocios` +
    `?select=id&estado=eq.activo&limit=1&slug=eq.${encodeURIComponent(slug)}`;

  const respuesta = await fetch(consulta, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    // El cache de acá arriba es el que manda; no queremos otro en el medio.
    cache: "no-store",
  });

  if (!respuesta.ok) {
    throw new Error(`negocios por slug: HTTP ${respuesta.status}`);
  }

  const filas = (await respuesta.json()) as Array<{ id: string }>;
  return filas[0]?.id ?? null;
}

export async function resolverTienda(slug: string): Promise<ResolucionTienda> {
  const clave = slug.toLowerCase();

  const cacheado = cache.get(clave);
  if (cacheado && cacheado.expira > Date.now()) {
    return cacheado.negocioId
      ? { estado: "existe", negocioId: cacheado.negocioId }
      : { estado: "no-existe" };
  }

  let pendiente = enVuelo.get(clave);
  if (!pendiente) {
    pendiente = consultar(clave)
      .then((negocioId) => {
        guardar(clave, negocioId);
        return negocioId;
      })
      .finally(() => {
        enVuelo.delete(clave);
      });
    enVuelo.set(clave, pendiente);
  }

  try {
    const negocioId = await pendiente;
    return negocioId ? { estado: "existe", negocioId } : { estado: "no-existe" };
  } catch (error) {
    // Un error NO se cachea y NO se convierte en 404: si Supabase parpadea, la
    // respuesta correcta es dejar pasar el request y que la página resuelva el
    // tenant como siempre. Tratarlo como "no existe" tiraría abajo todos los
    // catálogos por un 500 de un segundo.
    console.error("[TENANT CACHE]", slug, error);
    return { estado: "indeterminado" };
  }
}

/** Para los tests: el cache es estado de módulo y hay que poder vaciarlo. */
export function limpiarCacheTenants() {
  cache.clear();
  enVuelo.clear();
}
