/**
 * Mueve las imágenes de un negocio a su carpeta `<negocio_id>/…` dentro de los
 * buckets del proyecto multi-tenant, y reescribe las URLs guardadas en la base.
 *
 * Cubre los dos casos que hay hoy:
 *   - Archivos que YA están en este proyecto pero en rutas viejas (raíz,
 *     thumbs/, grids/, optimized/): se mueven dentro del bucket, sin bajar
 *     nada.
 *   - Archivos que quedaron en el proyecto Supabase del comercio migrado: se
 *     descargan por su URL pública y se suben acá.
 *
 * El orden importa y es en tres fases: copiar, reescribir las URLs, y recién
 * entonces borrar el original. Mover de una (move) deja una ventana en la que
 * el archivo ya no está en la ruta vieja y la base todavía la apunta: sobre
 * una tienda abierta, eso son fotos rotas para el que esté navegando. Además
 * hace el script repetible — si se corta a la mitad, las URLs apuntan a un
 * archivo que existe, sea el viejo o el nuevo.
 *
 * Uso:
 *   node --experimental-strip-types scripts/migrar-imagenes-a-carpeta-negocio.ts --negocio=clicktostado
 *   node --experimental-strip-types scripts/migrar-imagenes-a-carpeta-negocio.ts --negocio=clicktostado --aplicar
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

cargarEnv(".env.local");

const APLICAR = process.argv.includes("--aplicar");
const SLUG = (process.argv.find((a) => a.startsWith("--negocio=")) ?? "").split(
  "=",
)[1];

if (!SLUG) {
  console.error(
    "Falta --negocio=<slug>. Ej: --negocio=clicktostado",
  );
  process.exit(1);
}

const URL_DESTINO = requerido("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const KEY_DESTINO = requerido("SUPABASE_SERVICE_ROLE_KEY");

const db = createClient(URL_DESTINO, KEY_DESTINO, {
  auth: { persistSession: false },
});

/**
 * Buckets del origen que en este proyecto se llaman distinto.
 *
 * Ninja Camisetas guardaba las fotos en un bucket `camisetas`. Acá las
 * imágenes de producto viven todas en `productos`: es el único bucket (junto
 * con `logos`) cubierto por las policies de storage por negocio. Traerlas a un
 * bucket `camisetas` nuevo las dejaría sin ninguna policy.
 */
const BUCKET_DESTINO: Record<string, string> = {
  camisetas: "productos",
};

/** Columnas con URLs. `lista` = el valor es un array JSON stringificado. */
const CAMPOS: { tabla: string; columnas: { nombre: string; lista: boolean }[] }[] =
  [
    {
      tabla: "productos",
      columnas: [
        { nombre: "imagen_url", lista: true },
        { nombre: "thumbnail_url", lista: true },
        { nombre: "grid_url", lista: true },
      ],
    },
    { tabla: "categorias", columnas: [{ nombre: "imagen_url", lista: false }] },
    {
      tabla: "configuracion_pos",
      columnas: [
        { nombre: "posLogo", lista: false },
        { nombre: "banner_imagen", lista: false },
      ],
    },
  ];

interface Movimiento {
  /** Bucket en el origen. */
  bucket: string;
  /** Bucket acá. Casi siempre el mismo; ver BUCKET_DESTINO. */
  bucketDestino: string;
  desde: string;
  hasta: string;
  externo: boolean;
  urlOrigen: string;
  urlNueva: string;
}

async function main() {
  const { data: negocio, error } = await db
    .from("negocios")
    .select("id, nombre, slug")
    .eq("slug", SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!negocio) {
    console.error(`No existe un negocio con slug "${SLUG}".`);
    process.exit(1);
  }

  const negocioId = negocio.id as string;

  console.log(
    `\n=== Imágenes de "${negocio.nombre}" ===\n` +
      `Negocio: ${negocioId}\n` +
      `Modo   : ${APLICAR ? "APLICAR (mueve y reescribe)" : "DRY-RUN"}\n`,
  );

  const movimientos = new Map<string, Movimiento>();
  // Cambios de base: tabla -> id -> { columna: valorNuevo }
  const cambios = new Map<string, Map<string, Record<string, string>>>();

  for (const { tabla, columnas } of CAMPOS) {
    const seleccion = ["id", ...columnas.map((c) => `"${c.nombre}"`)].join(", ");
    const { data: filas, error: errSel } = await db
      .from(tabla)
      .select(seleccion)
      .eq("negocio_id", negocioId);

    if (errSel) {
      console.log(`  (${tabla}: ${errSel.message} — se saltea)`);
      continue;
    }

    for (const fila of filas ?? []) {
      const registro = fila as unknown as Record<string, unknown>;
      for (const { nombre, lista } of columnas) {
        const valor = registro[nombre];
        if (typeof valor !== "string" || !valor) continue;

        const urls = lista ? parsearLista(valor) : [valor];
        if (urls.length === 0) continue;

        const nuevas = urls.map((url) => {
          const mov = planificar(url, negocioId);
          if (!mov) return url;
          movimientos.set(`${mov.bucket}|${mov.desde}`, mov);
          return mov.urlNueva;
        });

        const cambio = lista ? JSON.stringify(nuevas) : nuevas[0];
        if (cambio === valor) continue;

        if (!cambios.has(tabla)) cambios.set(tabla, new Map());
        const porFila = cambios.get(tabla)!;
        const id = registro.id as string;
        porFila.set(id, { ...(porFila.get(id) ?? {}), [nombre]: cambio });
      }
    }
  }

  const lista = [...movimientos.values()];
  const externos = lista.filter((m) => m.externo).length;

  console.log(`Archivos a mover dentro de este proyecto: ${lista.length - externos}`);
  console.log(`Archivos a traer de otro proyecto:        ${externos}`);
  let filasACambiar = 0;
  for (const [tabla, porFila] of cambios) {
    console.log(`URLs a reescribir en ${tabla}: ${porFila.size} filas`);
    filasACambiar += porFila.size;
  }
  if (lista.length === 0 && filasACambiar === 0) {
    console.log("\nNo hay nada para migrar: ya está todo en su carpeta.\n");
    return;
  }

  if (!APLICAR) {
    console.log("\nEjemplos:");
    for (const m of lista.slice(0, 3)) {
      console.log(`  ${m.bucket}: ${m.desde}\n    -> ${m.bucketDestino}: ${m.hasta}`);
    }
    console.log("\nDry-run: no se tocó nada. Repetí con --aplicar.\n");
    return;
  }

  // FASE 1: copiar (no destructivo). El original sigue sirviendo hasta el final.
  let copiados = 0;
  let fallados = 0;
  const rotos = new Set<string>();
  const copiadosOk: Movimiento[] = [];

  for (const m of lista) {
    try {
      if (m.externo) {
        const respuesta = await fetch(m.urlOrigen);
        if (!respuesta.ok) throw new Error(`descarga HTTP ${respuesta.status}`);
        const bytes = new Uint8Array(await respuesta.arrayBuffer());
        const { error: errUp } = await db.storage
          .from(m.bucketDestino)
          .upload(m.hasta, bytes, {
            cacheControl: "31536000",
            contentType:
              respuesta.headers.get("content-type") ?? "application/octet-stream",
            upsert: true,
          });
        if (errUp) throw errUp;
      } else {
        const { error: errCopy } = await db.storage
          .from(m.bucket)
          .copy(m.desde, m.hasta, { destinationBucket: m.bucketDestino });
        // Si ya estaba copiado de una corrida anterior, no es un error.
        if (errCopy && !(await existe(m.bucketDestino, m.hasta))) throw errCopy;
      }
      copiados++;
      copiadosOk.push(m);
      if (copiados % 200 === 0) console.log(`  … ${copiados}/${lista.length}`);
    } catch (e) {
      fallados++;
      rotos.add(m.urlOrigen);
      console.warn(`  ⚠ ${m.bucket}/${m.desde}: ${(e as Error).message ?? e}`);
    }
  }

  console.log(
    `✓ Archivos copiados: ${copiados}${fallados ? ` (fallaron ${fallados})` : ""}`,
  );

  // FASE 2: URLs, sólo de lo que se copió bien. Una URL cuyo archivo falló se
  // deja como estaba: sigue apuntando al original, que no se tocó.
  let filasActualizadas = 0;
  for (const [tabla, porFila] of cambios) {
    for (const [id, columnas] of porFila) {
      const limpio: Record<string, string> = {};
      let salteada = false;
      for (const [columna, valor] of Object.entries(columnas)) {
        if ([...rotos].some((url) => valor.includes(basename(url)))) {
          salteada = true;
          continue;
        }
        limpio[columna] = valor;
      }
      if (Object.keys(limpio).length === 0) continue;

      const { error: errUpd } = await db.from(tabla).update(limpio).eq("id", id);
      if (errUpd) {
        console.warn(`  ⚠ ${tabla} ${id}: ${errUpd.message}`);
        continue;
      }
      filasActualizadas++;
      if (salteada) {
        console.warn(`  ⚠ ${tabla} ${id}: se actualizó parcial (hubo archivos que fallaron)`);
      }
    }
  }

  console.log(`✓ Filas con URLs reescritas: ${filasActualizadas}`);

  // FASE 3: recién ahora se borra el original, y sólo de los internos (los
  // externos viven en el proyecto del comercio, que no es nuestro para borrar).
  let borrados = 0;
  const porBucket = new Map<string, string[]>();
  for (const m of copiadosOk) {
    if (m.externo) continue;
    if (!porBucket.has(m.bucket)) porBucket.set(m.bucket, []);
    porBucket.get(m.bucket)!.push(m.desde);
  }

  for (const [bucket, rutas] of porBucket) {
    for (let i = 0; i < rutas.length; i += 100) {
      const lote = rutas.slice(i, i + 100);
      const { error: errDel } = await db.storage.from(bucket).remove(lote);
      if (errDel) {
        console.warn(`  ⚠ borrando en ${bucket}: ${errDel.message}`);
        continue;
      }
      borrados += lote.length;
    }
  }

  console.log(`✓ Originales borrados: ${borrados}\n`);
}

/** ¿Ya existe ese objeto? Sirve para que reintentar no sea un error. */
async function existe(bucket: string, ruta: string): Promise<boolean> {
  const corte = ruta.lastIndexOf("/");
  const carpeta = corte === -1 ? "" : ruta.slice(0, corte);
  const archivo = corte === -1 ? ruta : ruta.slice(corte + 1);

  const { data } = await db.storage
    .from(bucket)
    .list(carpeta, { search: archivo, limit: 1 });

  return Boolean(data?.some((o) => o.name === archivo));
}

/**
 * Decide a dónde va un archivo. Devuelve null si la URL no es de storage o si
 * el archivo ya está en la carpeta del negocio.
 */
function planificar(url: string, negocioId: string): Movimiento | null {
  const marca = "/storage/v1/object/public/";
  const corte = url.indexOf(marca);
  if (corte === -1) return null;

  const base = url.slice(0, corte);
  const resto = url.slice(corte + marca.length);
  const barra = resto.indexOf("/");
  if (barra === -1) return null;

  const bucket = resto.slice(0, barra);
  const bucketDestino = BUCKET_DESTINO[bucket] ?? bucket;
  const desde = decodeURIComponent(resto.slice(barra + 1).split("?")[0]);

  // Ya está en su lugar sólo si además no hay que cambiarlo de bucket.
  if (bucketDestino === bucket && desde.startsWith(`${negocioId}/`)) return null;

  // Se conserva la subcarpeta original (thumbs/, grids/, optimized/) para no
  // perder la convención que ya usa el código al leerlas.
  const hasta = `${negocioId}/${desde}`;

  return {
    bucket,
    bucketDestino,
    desde,
    hasta,
    externo: base !== URL_DESTINO,
    urlOrigen: url,
    urlNueva: `${URL_DESTINO}${marca}${bucketDestino}/${hasta}`,
  };
}

function parsearLista(valor: string): string[] {
  const limpio = valor.trim();
  if (limpio.startsWith("[")) {
    try {
      const parsed = JSON.parse(limpio);
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [limpio];
}

function basename(url: string) {
  return url.split("/").pop() ?? url;
}

function cargarEnv(archivo: string) {
  let contenido: string;
  try {
    contenido = readFileSync(archivo, "utf8");
  } catch {
    return;
  }
  for (const linea of contenido.split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    if (!(clave in process.env)) process.env[clave] = limpia.slice(igual + 1).trim();
  }
}

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`Falta la variable ${nombre} (.env.local o entorno).`);
    process.exit(1);
  }
  return valor;
}

main().catch((error) => {
  console.error("\n✗ Falló:", error.message ?? error);
  process.exit(1);
});
