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

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local / .env).",
  );
  process.exit(1);
}

console.error(`>>> Proyecto destino: ${SUPABASE_URL}`);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// SOLO DIAGNÓSTICO — no escribe nada, no tiene modo --commit. El atributo
// "2" (nombre literal, no un typo de este script) no tiene decisión tomada
// todavía: puede ser basura de import (índice de fila filtrado al JSONB por
// error de parser) o algo real que alguien todavía usa. Este reporte junta
// evidencia para decidir en otra sesión si se borra o se migra — no decide
// acá.

type VarianteRow = {
  id: string;
  producto_id: string;
  nombre_display: string;
  atributos: Record<string, string> | null;
};
type ProductoRow = { id: string; nombre: string; categoria_id: string | null };

async function fetchAll<T>(
  table: string,
  select: string,
  pageSize = 1000,
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all = all.concat(data as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const [productos, variantes, atributos] = await Promise.all([
    fetchAll<ProductoRow>("productos", "id, nombre, categoria_id"),
    fetchAll<VarianteRow>(
      "producto_variantes",
      "id, producto_id, nombre_display, atributos",
    ),
    fetchAll<{ id: string; nombre: string }>("atributos", "id, nombre"),
  ]);

  const atributoDos = atributos.find((a) => a.nombre === "2");
  const productoById = new Map(productos.map((p) => [p.id, p]));

  console.log('=== DIAGNÓSTICO — atributo "2" ===\n');

  if (!atributoDos) {
    console.log('No existe fila en `atributos` con nombre "2" en esta base.');
  } else {
    console.log(`Fila en atributos: id=${atributoDos.id}, nombre="2"`);
  }

  const conClave2 = variantes.filter(
    (v) => v.atributos && Object.prototype.hasOwnProperty.call(v.atributos, "2"),
  );
  const valores = new Map<string, number>();
  for (const v of conClave2) {
    const val = String(v.atributos!["2"]);
    valores.set(val, (valores.get(val) ?? 0) + 1);
  }

  console.log(`\nVariantes con clave "2" en atributos JSONB: ${conClave2.length} de ${variantes.length} totales`);
  console.log("Distribución de valores:");
  for (const [val, count] of [...valores.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  "${val}": ${count}`);
  }

  // Otras claves que aparecen JUNTO con "2" en la misma variante — para ver
  // si "2" es redundante con algo (ej. siempre coincide con un Talle
  // numérico) o si es información aparte.
  const productosAfectados = new Set(conClave2.map((v) => v.producto_id));
  console.log(`\nProductos únicos afectados: ${productosAfectados.size}`);

  console.log("\n--- Muestra (hasta 15) ---");
  for (const v of conClave2.slice(0, 15)) {
    const producto = productoById.get(v.producto_id);
    console.log(
      `  producto "${producto?.nombre ?? "?"}" (${v.producto_id}) | variante ${v.id} | atributos: ${JSON.stringify(v.atributos)}`,
    );
  }

  if (atributoDos) {
    const { data: pvv, error } = await supabase
      .from("producto_variante_valores")
      .select("id, variante_id, atributo_valor_id")
      .eq("atributo_id", atributoDos.id);
    if (error) throw new Error(error.message);
    console.log(
      `\nFilas en producto_variante_valores para este atributo (relacional): ${pvv?.length ?? 0}`,
    );
    console.log(
      "Comparar contra el conteo de arriba (JSONB) — si difieren mucho, la relación no se mantuvo sincronizada con el JSONB para este atributo.",
    );
  }

  console.log(
    "\nEsto es SOLO diagnóstico. Decisión pendiente: borrar la clave (si es basura de import) o migrarla a un campo real (si representa algo con significado). No tocar sin decidir primero con Nacho.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
