/**
 * Reubica las derivadas (thumbs/grids/optimized) que quedaron en la RAÍZ del
 * bucket, moviéndolas a la carpeta de su negocio y actualizando la URL.
 *
 * Por qué: la policy de Storage exige
 * `(storage.foldername(name))[1] = current_negocio_id()`. Un archivo en la raíz
 * no tiene carpeta de negocio, así que NINGUNA sesión de usuario puede borrarlo
 * ni actualizarlo — solo el service role. Consecuencia concreta: al borrar el
 * producto, esa imagen se filtra para siempre, porque el borrado de imágenes de
 * la app no la alcanza.
 *
 * Origen (12/8/2026): `backfill-image-thumbnails.ts` armaba el path como
 * `grids/<uuid>-grid.webp`, sin prefijo de negocio — venía de antes del
 * multi-tenant. Una corrida generó 550 archivos así. El script ya está
 * corregido; esto limpia lo que dejó.
 *
 * A diferencia de un re-backfill, NO vuelve a descargar ni a recomprimir nada:
 * mueve el objeto tal cual (mismo byte, misma calidad) y reescribe la URL. Es
 * gratis en egress y no toca la calidad de ninguna imagen.
 *
 * Uso:
 *   npm run reubicar:derivadas              # DRY-RUN
 *   npm run reubicar:derivadas -- --commit  # mueve y actualiza
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMMIT = process.argv.includes("--commit");
const BUCKET = "productos";
const CARPETAS_RAIZ = ["thumbs", "grids", "optimized"];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MARCA = `/storage/v1/object/public/${BUCKET}/`;

function pathDeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const i = url.indexOf(MARCA);
  if (i < 0) return null;
  return url.slice(i + MARCA.length).split(/[?#]/)[0] || null;
}

function esDeRaiz(p: string): boolean {
  return CARPETAS_RAIZ.includes(p.split("/")[0]);
}

function parseArray(value: unknown): (string | null)[] {
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" && v ? v : null));
  if (typeof value !== "string" || !value) return [];
  try {
    const p = JSON.parse(value);
    return Array.isArray(p) ? p.map((v) => (typeof v === "string" && v ? v : null)) : [value];
  } catch {
    return [value];
  }
}

async function main() {
  console.log(`Modo: ${COMMIT ? "COMMIT (mueve y actualiza)" : "DRY-RUN"}\n`);

  const productos: {
    id: string;
    negocio_id: string;
    thumbnail_url: string | null;
    grid_url: string | null;
    imagen_url: string | null;
  }[] = [];

  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("productos")
      .select("id, negocio_id, thumbnail_url, grid_url, imagen_url")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    productos.push(...((data ?? []) as typeof productos));
    if (!data || data.length < 1000) break;
  }

  let movidos = 0;
  let productosTocados = 0;
  const fallos: string[] = [];
  const columnas = ["thumbnail_url", "grid_url", "imagen_url"] as const;

  for (const p of productos) {
    const update: Record<string, string> = {};

    for (const col of columnas) {
      const urls = parseArray(p[col]);
      let cambio = false;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (!url) continue;
        const actual = pathDeUrl(url);
        if (!actual || !esDeRaiz(actual)) continue;

        const destino = `${p.negocio_id}/${actual}`;
        if (COMMIT) {
          const { error } = await supabase.storage
            .from(BUCKET)
            .move(actual, destino);
          // Si el destino ya existe (reintento), se sigue igual: lo que
          // importa es que la URL termine apuntando a la carpeta correcta.
          if (error && !/exists/i.test(error.message)) {
            fallos.push(`${actual}: ${error.message}`);
            continue;
          }
          urls[i] = supabase.storage.from(BUCKET).getPublicUrl(destino)
            .data.publicUrl;
        }
        movidos++;
        cambio = true;
      }

      if (cambio) update[col] = JSON.stringify(urls);
    }

    if (Object.keys(update).length === 0) continue;
    productosTocados++;

    if (COMMIT) {
      const { error } = await supabase.from("productos").update(update).eq("id", p.id);
      if (error) fallos.push(`producto ${p.id}: ${error.message}`);
      if (productosTocados % 50 === 0) {
        console.log(`  ${productosTocados} productos actualizados...`);
      }
    }
  }

  console.log(`\nArchivos en la raíz referenciados: ${movidos}`);
  console.log(`Productos afectados: ${productosTocados}`);
  if (fallos.length) {
    console.log(`Fallos: ${fallos.length}`);
    for (const f of fallos.slice(0, 20)) console.log(`  - ${f}`);
  }
  if (!COMMIT) console.log("\nDRY-RUN: no se movió nada. Correr con --commit.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
