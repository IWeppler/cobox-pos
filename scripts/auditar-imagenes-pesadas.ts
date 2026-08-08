/**
 * Auditoría READ-ONLY del bucket `productos`: busca imágenes que quedaron
 * guardadas sin comprimir.
 *
 * Por qué existe: hasta el fix de `optimizarImagen`, el catch de la compresión
 * hacía `return file` — si el navegador no podía comprimir (HEIC, falta de
 * memoria, canvas trabado), se subía el ORIGINAL. Y como se llama tres veces
 * por imagen (main + thumbnail + grid), un solo fallo dejaba el archivo crudo
 * guardado tres veces. Esos objetos siguen ahí; este script dice cuántos son
 * y cuánto pesan antes de decidir si vale la pena un backfill.
 *
 * NO escribe, NO borra, NO modifica nada. Solo lista y cuenta.
 *
 * Uso (una base por vez, apuntando .env.local al proyecto que se quiere ver):
 *   npm run auditar:imagenes
 *   npm run auditar:imagenes -- --json > reporte-evens.json
 *   npm run auditar:imagenes -- --top 50
 */

import { createClient } from "@supabase/supabase-js";
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

// Mismo criterio que backfill-image-thumbnails.ts: .env.local primero, para
// que el service role del proyecto apuntado no quede pisado en silencio.
loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL (esperado en .env).");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Este script necesita el " +
      "service role para listar Storage sin RLS — pegala en .env.local " +
      "(gitignoreado), NUNCA en .env. Supabase Dashboard > Project Settings " +
      "> API > service_role.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "productos";
const PAGINA = 100;

// Los mismos números que usa la app, para que el reporte hable el idioma del
// código y no de una constante inventada acá.
const MAX_BYTES_GUARDADOS = 2 * 1024 * 1024;

/** Objetivos de optimizarImagen (maxSizeMB), en bytes. Un archivo muy por
 * encima de su objetivo es sospechoso aunque no llegue a los 2MB.
 *
 * Los banners no salen de optimizarImagenProducto (son del catálogo público,
 * se ven a ancho completo): tienen su propio objetivo, más alto, y no se
 * mezclan con las imágenes de producto en el conteo de sospechosos. */
const OBJETIVO: Record<Categoria, number> = {
  main: 0.2 * 1024 * 1024,
  grid: 0.1 * 1024 * 1024,
  thumbnail: 0.03 * 1024 * 1024,
  banner: 0.5 * 1024 * 1024,
};

/** Categorías que sí pasan por el optimizador de productos. */
const CATEGORIAS_PRODUCTO = ["main", "grid", "thumbnail"] as const;

/** Margen sobre el objetivo antes de marcar algo como sospechoso. `maxSizeMB`
 * es un objetivo y no un tope duro, así que un exceso chico es esperable; 3×
 * ya no. */
const FACTOR_SOSPECHOSO = 3;

type Categoria = "main" | "grid" | "thumbnail" | "banner";

type ObjetoStorage = {
  ruta: string;
  categoria: Categoria;
  bytes: number;
  negocioId: string;
};

const args = process.argv.slice(2);
const SALIDA_JSON = args.includes("--json");
const TOP = (() => {
  const i = args.indexOf("--top");
  if (i === -1) return 20;
  const n = Number.parseInt(args[i + 1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
})();

/** El log normal va a stderr cuando la salida es JSON, así que `> archivo.json`
 * da un JSON limpio y el progreso se sigue viendo en pantalla. */
function log(...partes: unknown[]) {
  if (SALIDA_JSON) console.error(...partes);
  else console.log(...partes);
}

function mb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(2);
}

/** Subcarpetas conocidas del bucket. Aparecen tanto colgando de la carpeta de
 * negocio (`<negocio>/thumbs/…`) como sueltas en la raíz (`thumbs/…`), porque
 * la migración a carpeta por negocio no alcanzó a todo. */
const SUBCARPETAS = new Set(["thumbs", "grids", "banners", "optimized"]);

/** Por segmento y no por substring: `ruta.includes("/grids/")` no matchea un
 * `grids/x.webp` que está en la raíz, y esos archivos se contaban como main.
 * En Evens eran 311 objetos mal clasificados. */
function categoriaDeRuta(ruta: string): Categoria {
  const partes = ruta.split("/");
  if (partes.includes("thumbs")) return "thumbnail";
  if (partes.includes("grids")) return "grid";
  if (partes.includes("banners")) return "banner";
  // `optimized/` la escribe backfill-image-thumbnails.ts: son mains
  // re-comprimidos, así que cuentan como main.
  return "main";
}

/** Los productos viejos viven en la raíz del bucket, sin carpeta de negocio
 * (son anteriores a migrar-imagenes-a-carpeta-negocio.ts). Sin este caso,
 * cada archivo suelto se contaba como si fuera su propio negocio — y las
 * subcarpetas sueltas de la raíz se contaban como si fueran negocios. */
function negocioDeRuta(ruta: string): string {
  const partes = ruta.split("/");
  if (partes.length === 1 || SUBCARPETAS.has(partes[0])) {
    return "(raíz — sin carpeta de negocio)";
  }
  return partes[0];
}

type FilaStorage = {
  name: string;
  id: string | null;
  metadata: { size?: number } | null;
};

/** Recorre el bucket recursivamente. En la API de Storage una "carpeta" es una
 * fila sin `id`; los archivos traen el peso en `metadata.size`. */
async function listarRecursivo(prefijo: string): Promise<ObjetoStorage[]> {
  const encontrados: ObjetoStorage[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefijo, { limit: PAGINA, offset });

    if (error) {
      log(`  ! Error listando "${prefijo || "/"}": ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const fila of data as FilaStorage[]) {
      const ruta = prefijo ? `${prefijo}/${fila.name}` : fila.name;

      if (fila.id === null) {
        encontrados.push(...(await listarRecursivo(ruta)));
        continue;
      }

      const bytes = fila.metadata?.size ?? 0;
      encontrados.push({
        ruta,
        categoria: categoriaDeRuta(ruta),
        bytes,
        negocioId: negocioDeRuta(ruta),
      });
    }

    if (data.length < PAGINA) break;
    offset += PAGINA;
  }

  return encontrados;
}

async function main() {
  log(`Auditando bucket "${BUCKET}" en ${SUPABASE_URL}`);
  log("Solo lectura — este script no escribe ni borra nada.\n");

  const objetos = await listarRecursivo("");

  if (objetos.length === 0) {
    log("No se encontró ningún objeto. ¿El bucket es el correcto?");
    return;
  }

  const bytesTotales = objetos.reduce((acc, o) => acc + o.bytes, 0);

  const sinComprimir = objetos.filter((o) => o.bytes > MAX_BYTES_GUARDADOS);
  const sospechosos = objetos.filter(
    (o) =>
      o.categoria !== "banner" &&
      o.bytes <= MAX_BYTES_GUARDADOS &&
      o.bytes > OBJETIVO[o.categoria] * FACTOR_SOSPECHOSO,
  );

  // Cobertura: cada main debería tener su thumbnail y su grid. Los que
  // faltan hacen que el catálogo sirva el main donde iba una versión chica —
  // que es peso de más en cada card, no en el detalle.
  const cuenta = (cat: Categoria) =>
    objetos.filter((o) => o.categoria === cat).length;
  const cobertura = {
    mains: cuenta("main"),
    thumbnailsFaltantes: Math.max(0, cuenta("main") - cuenta("thumbnail")),
    gridsFaltantes: Math.max(0, cuenta("main") - cuenta("grid")),
  };

  const porCategoria = (cat: Categoria) => {
    const grupo = objetos.filter((o) => o.categoria === cat);
    const bytes = grupo.reduce((acc, o) => acc + o.bytes, 0);
    return {
      categoria: cat,
      cantidad: grupo.length,
      bytes,
      promedioBytes: grupo.length > 0 ? Math.round(bytes / grupo.length) : 0,
      objetivoBytes: OBJETIVO[cat],
      sinComprimir: grupo.filter((o) => o.bytes > MAX_BYTES_GUARDADOS).length,
    };
  };

  const resumen = {
    proyecto: SUPABASE_URL,
    bucket: BUCKET,
    generadoEn: new Date().toISOString(),
    totalObjetos: objetos.length,
    bytesTotales,
    umbralSinComprimirBytes: MAX_BYTES_GUARDADOS,
    sinComprimir: {
      cantidad: sinComprimir.length,
      bytes: sinComprimir.reduce((acc, o) => acc + o.bytes, 0),
    },
    sospechosos: {
      cantidad: sospechosos.length,
      bytes: sospechosos.reduce((acc, o) => acc + o.bytes, 0),
    },
    cobertura,
    porCategoria: (
      [...CATEGORIAS_PRODUCTO, "banner"] as Categoria[]
    ).map(porCategoria),
    peores: [...objetos]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, TOP)
      .map((o) => ({ ruta: o.ruta, bytes: o.bytes, categoria: o.categoria })),
  };

  if (SALIDA_JSON) {
    console.log(JSON.stringify(resumen, null, 2));
    return;
  }

  console.log("=".repeat(64));
  console.log(`Objetos totales : ${objetos.length}`);
  console.log(`Peso total      : ${mb(bytesTotales)} MB`);
  console.log("=".repeat(64));

  console.log("\nPor categoría:");
  for (const c of resumen.porCategoria) {
    console.log(
      `  ${c.categoria.padEnd(10)} ${String(c.cantidad).padStart(5)} objetos` +
        ` · ${mb(c.bytes).padStart(9)} MB total` +
        ` · promedio ${mb(c.promedioBytes)} MB (objetivo ${mb(c.objetivoBytes)} MB)` +
        (c.sinComprimir > 0 ? ` · ${c.sinComprimir} sin comprimir` : ""),
    );
  }

  console.log(
    `\nSIN COMPRIMIR (> ${mb(MAX_BYTES_GUARDADOS)} MB): ${sinComprimir.length} objetos, ${mb(resumen.sinComprimir.bytes)} MB`,
  );
  console.log(
    `SOSPECHOSOS (más de ${FACTOR_SOSPECHOSO}× su objetivo): ${sospechosos.length} objetos, ${mb(resumen.sospechosos.bytes)} MB`,
  );

  console.log("\nCobertura de versiones chicas:");
  console.log(`  mains                 : ${cobertura.mains}`);
  console.log(
    `  sin thumbnail propio  : ${cobertura.thumbnailsFaltantes}` +
      (cobertura.thumbnailsFaltantes > 0
        ? "  <- el catálogo sirve el main en su lugar"
        : ""),
  );
  console.log(
    `  sin grid propio       : ${cobertura.gridsFaltantes}` +
      (cobertura.gridsFaltantes > 0
        ? "  <- el catálogo sirve el main en su lugar"
        : ""),
  );

  if (sinComprimir.length > 0 || sospechosos.length > 0) {
    const desperdicio =
      resumen.sinComprimir.bytes + resumen.sospechosos.bytes;
    console.log(
      `\nEsos ${sinComprimir.length + sospechosos.length} objetos son ${mb(desperdicio)} MB` +
        ` (${((desperdicio / bytesTotales) * 100).toFixed(1)}% del bucket).`,
    );
  }

  console.log(`\nTop ${TOP} más pesados:`);
  for (const o of resumen.peores) {
    const marca = o.bytes > MAX_BYTES_GUARDADOS ? "!!" : "  ";
    console.log(`  ${marca} ${mb(o.bytes).padStart(8)} MB  ${o.ruta}`);
  }

  const porNegocio = new Map<string, { cantidad: number; bytes: number }>();
  for (const o of objetos) {
    const actual = porNegocio.get(o.negocioId) ?? { cantidad: 0, bytes: 0 };
    actual.cantidad++;
    actual.bytes += o.bytes;
    porNegocio.set(o.negocioId, actual);
  }
  if (porNegocio.size > 1) {
    console.log("\nPor carpeta de negocio:");
    for (const [negocio, datos] of [...porNegocio.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 20)) {
      console.log(
        `  ${negocio}  ${String(datos.cantidad).padStart(5)} objetos · ${mb(datos.bytes).padStart(9)} MB`,
      );
    }
  }

  console.log(
    "\nSi hay objetos sin comprimir, el backfill que los re-optimiza ya existe:" +
      "\n  npm run backfill:images   (revisar el script antes de correrlo)",
  );
}

main().catch((error) => {
  console.error("Error inesperado:", error);
  process.exit(1);
});
