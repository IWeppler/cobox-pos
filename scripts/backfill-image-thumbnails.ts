// Backfill de thumbnails faltantes + re-optimización de imágenes
// principales pesadas (>250KB). Corre fuera de Next, con service role
// (bypassea RLS de productos/storage) — no lo corras desde el browser.
//
// Uso:
//   node --experimental-strip-types scripts/backfill-image-thumbnails.ts
//     (dry-run por default: descarga y comprime en memoria para el
//     reporte, pero NO sube nada a Storage ni escribe en la tabla)
//   node --experimental-strip-types scripts/backfill-image-thumbnails.ts --commit
//     (corrida real)
//
// Requiere:
//   .env            NEXT_PUBLIC_SUPABASE_URL (ya existe)
//   .env.local      SUPABASE_SERVICE_ROLE_KEY (gitignoreado — nunca en .env)

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
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

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL (esperado en .env).");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Este script necesita " +
      "el service role (bypassea RLS de productos/storage) — pegala en " +
      ".env.local (gitignoreado), NUNCA en .env. Se consigue en Supabase " +
      "Dashboard > Project Settings > API > service_role.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const COMMIT = process.argv.includes("--commit");
const BUCKET = "productos";
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 15_000;
const MAIN_REOPTIMIZE_THRESHOLD_BYTES = 250_000;

type CompressParams = {
  maxDim: number;
  maxBytes: number;
  calidadInicial: number;
  calidadMinima: number;
};

// Mismos valores que shared/utils/image-optimizer.ts (maxWidthOrHeight,
// maxSizeMB, initialQuality) traducidos a sharp.
const MAIN_PARAMS: CompressParams = {
  maxDim: 600,
  maxBytes: 100_000,
  calidadInicial: 70,
  calidadMinima: 35,
};
const THUMB_PARAMS: CompressParams = {
  maxDim: 150,
  maxBytes: 30_000,
  calidadInicial: 70,
  calidadMinima: 35,
};

// ---------- utilidades ----------

function parseImageArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [value];
  } catch {
    return [value];
  }
}

async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency = CONCURRENCY,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

async function descargar(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function comprimir(
  buffer: Buffer,
  { maxDim, maxBytes, calidadInicial, calidadMinima }: CompressParams,
): Promise<Buffer> {
  let calidad = calidadInicial;
  let salida = await sharp(buffer)
    .rotate() // respeta EXIF orientation, igual que el canvas del browser
    .resize({
      width: maxDim,
      height: maxDim,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: calidad })
    .toBuffer();

  while (salida.length > maxBytes && calidad > calidadMinima) {
    calidad -= 10;
    salida = await sharp(buffer)
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: calidad })
      .toBuffer();
  }
  return salida;
}

async function subir(objectPath: string, buffer: Buffer): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// ---------- reporte ----------

type Fallo = { productoId: string; url: string; motivo: string };

const reporte = {
  fotosDescargadas: 0,
  fallosDescarga: [] as Fallo[],
  fase1: {
    productos: new Set<string>(),
    fotosOk: 0,
    bytesAntes: 0,
    bytesDespues: 0,
    fallos: [] as Fallo[],
  },
  fase2: {
    productos: new Set<string>(),
    fotosOk: 0,
    bytesAntes: 0,
    bytesDespues: 0,
    fallos: [] as Fallo[],
  },
};

// ---------- procesamiento (una sola descarga por foto, sirve a ambas fases) ----------

async function procesarProductos() {
  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, imagen_url, thumbnail_url")
    .not("imagen_url", "is", null)
    .neq("imagen_url", "");

  if (error) throw error;

  console.log(`Productos con imagen_url: ${productos.length}`);

  await pMap(productos, async (producto) => {
    const imagenes = parseImageArray(producto.imagen_url);
    const thumbsActuales = parseImageArray(producto.thumbnail_url);
    if (imagenes.length === 0) return;

    const thumbsFinal = [...thumbsActuales];
    const imagenesFinal = [...imagenes];
    let huboCambioThumb = false;
    let huboCambioMain = false;

    for (let i = 0; i < imagenes.length; i++) {
      const url = imagenes[i];
      const necesitaThumb = !thumbsActuales[i];

      let original: Buffer;
      try {
        original = await descargar(url);
        reporte.fotosDescargadas++;
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        reporte.fallosDescarga.push({ productoId: producto.id, url, motivo });
        continue;
      }

      // Fase 1: thumbnail faltante en este índice
      if (necesitaThumb) {
        reporte.fase1.bytesAntes += original.length;
        try {
          const thumb = await comprimir(original, THUMB_PARAMS);
          reporte.fase1.bytesDespues += thumb.length;
          reporte.fase1.fotosOk++;
          if (COMMIT) {
            const objectPath = `thumbs/${crypto.randomUUID()}-thumb.webp`;
            thumbsFinal[i] = await subir(objectPath, thumb);
          }
          huboCambioThumb = true;
          reporte.fase1.productos.add(producto.id);
        } catch (err) {
          const motivo = err instanceof Error ? err.message : String(err);
          reporte.fase1.fallos.push({ productoId: producto.id, url, motivo });
        }
      }

      // Fase 2: main pesado (mismo buffer ya descargado, no se vuelve a bajar)
      if (original.length > MAIN_REOPTIMIZE_THRESHOLD_BYTES) {
        reporte.fase2.bytesAntes += original.length;
        try {
          const optimizada = await comprimir(original, MAIN_PARAMS);
          reporte.fase2.bytesDespues += optimizada.length;
          reporte.fase2.fotosOk++;
          if (COMMIT) {
            const objectPath = `optimized/${crypto.randomUUID()}.webp`;
            imagenesFinal[i] = await subir(objectPath, optimizada);
          }
          huboCambioMain = true;
          reporte.fase2.productos.add(producto.id);
        } catch (err) {
          const motivo = err instanceof Error ? err.message : String(err);
          reporte.fase2.fallos.push({ productoId: producto.id, url, motivo });
        }
      }
    }

    if (COMMIT && (huboCambioThumb || huboCambioMain)) {
      const update: Record<string, string> = {};
      if (huboCambioThumb) update.thumbnail_url = JSON.stringify(thumbsFinal);
      if (huboCambioMain) update.imagen_url = JSON.stringify(imagenesFinal);

      const { error: updateError } = await supabase
        .from("productos")
        .update(update)
        .eq("id", producto.id);

      if (updateError) {
        reporte.fase1.fallos.push({
          productoId: producto.id,
          url: "(update)",
          motivo: updateError.message,
        });
      }
    }
  });
}

// ---------- impresión ----------

function fmtMB(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(2) + "MB";
}

function imprimirFase(
  nombre: string,
  r: { productos: Set<string>; fotosOk: number; bytesAntes: number; bytesDespues: number; fallos: Fallo[] },
) {
  const ahorro =
    r.bytesAntes > 0 ? (1 - r.bytesDespues / r.bytesAntes) * 100 : 0;
  console.log(`\n--- ${nombre} ---`);
  console.log(`Productos afectados: ${r.productos.size}`);
  console.log(`Fotos OK: ${r.fotosOk}`);
  console.log(`Fallos: ${r.fallos.length}`);
  for (const f of r.fallos.slice(0, 20)) {
    console.log(`  - producto ${f.productoId} (${f.url}): ${f.motivo}`);
  }
  if (r.fallos.length > 20) console.log(`  ... y ${r.fallos.length - 20} más`);
  console.log(`Tamaño antes: ${fmtMB(r.bytesAntes)}`);
  console.log(`Tamaño después: ${fmtMB(r.bytesDespues)}`);
  console.log(`Reducción: ${ahorro.toFixed(1)}%`);
}

async function main() {
  console.log(
    `Modo: ${COMMIT ? "COMMIT (escribe en Storage y en la tabla)" : "DRY-RUN (solo reporte, no escribe nada)"}`,
  );

  await procesarProductos();

  console.log(`\nFotos descargadas: ${reporte.fotosDescargadas}`);
  console.log(`Fallos de descarga: ${reporte.fallosDescarga.length}`);
  for (const f of reporte.fallosDescarga.slice(0, 20)) {
    console.log(`  - producto ${f.productoId} (${f.url}): ${f.motivo}`);
  }

  imprimirFase("FASE 1 — thumbnails faltantes", reporte.fase1);
  imprimirFase("FASE 2 — mains re-optimizados (>250KB)", reporte.fase2);

  if (!COMMIT) {
    console.log(
      "\nEsto fue un dry-run. Nada se subió a Storage ni se escribió en la tabla.",
    );
    console.log(
      "Para la corrida real: node --experimental-strip-types scripts/backfill-image-thumbnails.ts --commit",
    );
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
