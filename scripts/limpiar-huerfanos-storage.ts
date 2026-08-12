/**
 * Limpieza de objetos huérfanos del bucket `productos`.
 *
 * Qué borra: los objetos que quedaron en la RAÍZ del bucket (archivos planos y
 * las carpetas `thumbs/`, `grids/`, `optimized/` de nivel superior), que son
 * restos de antes de que las imágenes se guardaran bajo la carpeta del negocio.
 * Al 12/8/2026 eran 932 objetos / 284 MB — el 58% del bucket — y NINGUNO estaba
 * referenciado por la base.
 *
 * Por qué no se pueden borrar desde la app: la policy de Storage exige
 * `(storage.foldername(name))[1] = current_negocio_id()`. Un archivo en la raíz
 * no tiene carpeta, así que ninguna sesión de usuario puede tocarlo. Hace falta
 * el service role, y por eso esto es un script y no un botón.
 *
 * LA GARANTÍA: no confía en ningún análisis previo. En cada corrida arma el
 * conjunto de paths EN USO leyendo la base, y solo borra lo que no está ahí. Si
 * mañana algo vuelve a apuntar a la raíz, ese archivo deja de ser candidato
 * solo. Las 5 columnas que pueden guardar una URL de Storage se verificaron
 * recorriendo el esquema entero (no por nombre de columna): productos
 * imagen/thumbnail/grid/master_url, y configuracion_pos posLogo/banner_imagen.
 *
 * Uso:
 *   npm run limpiar:huerfanos            # DRY-RUN: lista y cuenta, no borra
 *   npm run limpiar:huerfanos -- --commit  # borra de verdad
 *
 * Antes de borrar SIEMPRE escribe un manifiesto JSON con lo que va a borrar.
 * No vuelve atrás —Storage no tiene papelera— pero deja constancia de qué había.
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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. El service " +
      "role es imprescindible: los objetos de la raíz no los puede borrar " +
      "ninguna sesión de usuario (ver la policy de Storage).",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Un objeto está en la raíz si no cuelga de una carpeta de negocio (uuid). */
function esDeLaRaiz(name: string): boolean {
  if (!name.includes("/")) return true;
  const primera = name.split("/")[0];
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    primera,
  );
}

/**
 * Todos los paths que la base referencia HOY. Se re-calcula en cada corrida:
 * es la única red que impide borrar algo que volvió a estar en uso.
 */
async function pathsEnUso(): Promise<Set<string>> {
  const enUso = new Set<string>();
  const marca = `/storage/v1/object/public/${BUCKET}/`;

  const agregar = (valor: unknown) => {
    if (typeof valor !== "string" || !valor) return;
    let i = valor.indexOf(marca);
    while (i >= 0) {
      const resto = valor.slice(i + marca.length);
      // El valor puede ser un JSON array con varias URLs: se corta en el
      // primer caracter que no puede formar parte de un path.
      const path = resto.split(/["'\s,\]]/)[0].split(/[?#]/)[0];
      if (path) {
        try {
          enUso.add(decodeURIComponent(path));
        } catch {
          enUso.add(path);
        }
      }
      i = valor.indexOf(marca, i + marca.length);
    }
  };

  // Paginado: productos pasa las 1000 filas y PostgREST corta en silencio
  // (ver shared/lib/traer-todo.ts — el mismo bug que escondió 116 productos).
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("productos")
      .select("imagen_url, thumbnail_url, grid_url, master_url")
      .range(desde, desde + 999);
    if (error) throw new Error(`Leyendo productos: ${error.message}`);
    for (const fila of data ?? []) {
      agregar(fila.imagen_url);
      agregar(fila.thumbnail_url);
      agregar(fila.grid_url);
      agregar(fila.master_url);
    }
    if (!data || data.length < 1000) break;
  }

  const { data: config, error: errConfig } = await supabase
    .from("configuracion_pos")
    .select('"posLogo", banner_imagen');
  if (errConfig) throw new Error(`Leyendo configuracion_pos: ${errConfig.message}`);
  for (const fila of config ?? []) {
    agregar((fila as Record<string, unknown>).posLogo);
    agregar((fila as Record<string, unknown>).banner_imagen);
  }

  return enUso;
}

type Objeto = { name: string; bytes: number };

/** Lista recursiva del bucket: la API pagina y no baja sola a las subcarpetas. */
async function listarTodo(prefijo = ""): Promise<Objeto[]> {
  const salida: Objeto[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefijo, { limit: 1000, offset });
    if (error) throw new Error(`Listando "${prefijo}": ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const full = prefijo ? `${prefijo}/${item.name}` : item.name;
      // Sin `id` es una "carpeta" (prefijo), no un objeto.
      if (item.id === null || item.id === undefined) {
        salida.push(...(await listarTodo(full)));
      } else {
        salida.push({
          name: full,
          bytes: Number(item.metadata?.size ?? 0),
        });
      }
    }
    if (data.length < 1000) break;
  }
  return salida;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  console.log(
    `Modo: ${COMMIT ? "COMMIT (BORRA de verdad)" : "DRY-RUN (no borra nada)"}\n`,
  );

  const enUso = await pathsEnUso();
  console.log(`Paths referenciados por la base: ${enUso.size}`);

  const todos = await listarTodo();
  console.log(`Objetos en el bucket: ${todos.length}`);

  const raiz = todos.filter((o) => esDeLaRaiz(o.name));
  const candidatos = raiz.filter((o) => !enUso.has(o.name));
  const enRaizPeroEnUso = raiz.filter((o) => enUso.has(o.name));

  console.log(`\nEn la raíz: ${raiz.length} (${mb(raiz.reduce((a, o) => a + o.bytes, 0))})`);
  console.log(`  huérfanos (se borran): ${candidatos.length} (${mb(candidatos.reduce((a, o) => a + o.bytes, 0))})`);
  console.log(`  EN USO (NO se tocan):  ${enRaizPeroEnUso.length}`);

  if (enRaizPeroEnUso.length > 0) {
    console.log(
      "\n  ATENCIÓN: hay objetos en la raíz que SÍ está usando la base. No se " +
        "borran, pero conviene entender por qué están ahí:",
    );
    for (const o of enRaizPeroEnUso.slice(0, 10)) console.log(`    - ${o.name}`);
  }

  if (candidatos.length === 0) {
    console.log("\nNada que borrar.");
    return;
  }

  // Va a la raíz del repo pero gitignoreado (`huerfanos-storage-*.json`): es el
  // registro de UNA corrida, no parte del proyecto. Antes quedaba trackeado y
  // se colaba en el próximo commit — 89 KB de nombres de archivos borrados.
  const manifiesto = path.join(
    ROOT,
    `huerfanos-storage-${new Date().toISOString().slice(0, 19).replace(/[:]/g, "")}.json`,
  );
  fs.writeFileSync(
    manifiesto,
    JSON.stringify(
      { generado: new Date().toISOString(), bucket: BUCKET, objetos: candidatos },
      null,
      2,
    ),
  );
  console.log(`\nManifiesto escrito: ${manifiesto}`);

  if (!COMMIT) {
    console.log("\nDRY-RUN: no se borró nada. Volvé a correr con --commit.");
    console.log("Primeros 10 candidatos:");
    for (const o of candidatos.slice(0, 10)) {
      console.log(`  ${(o.bytes / 1024).toFixed(0).padStart(6)} KB  ${o.name}`);
    }
    return;
  }

  let borrados = 0;
  const fallos: string[] = [];
  for (let i = 0; i < candidatos.length; i += 100) {
    const lote = candidatos.slice(i, i + 100).map((o) => o.name);
    const { data, error } = await supabase.storage.from(BUCKET).remove(lote);
    if (error) {
      fallos.push(`lote ${i}: ${error.message}`);
      continue;
    }
    borrados += data?.length ?? 0;
    console.log(`  borrados ${borrados}/${candidatos.length}`);
  }

  console.log(`\nBorrados: ${borrados}`);
  if (fallos.length) {
    console.log(`Fallos: ${fallos.length}`);
    for (const f of fallos) console.log(`  - ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
