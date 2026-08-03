/**
 * Migra Ninja Camisetas desde su base vieja (schema legacy de 3 tablas) al
 * proyecto multi-tenant, como un negocio más.
 *
 * Por qué un script aparte y no `migrar-negocio-a-multitenant.ts`: ese asume
 * que el origen ya tiene el schema Comerz y copia tabla a tabla. Ninja no lo
 * tiene — son `productos` / `productos_stock` / `ventas` planas, sin
 * variantes, sin categorías y con la venta como una fila suelta. Acá hay
 * transformación real, no copia.
 *
 * El negocio TIENE que existir ya en el destino (se creó desde el panel). Lo
 * que falta es su catálogo.
 *
 * Uso:
 *   node --experimental-strip-types scripts/migrar-ninja-camisetas.ts
 *   node --experimental-strip-types scripts/migrar-ninja-camisetas.ts --aplicar
 *
 * Variables (.env.local):
 *   ORIGEN_SUPABASE_URL            base vieja de Ninja
 *   ORIGEN_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL       proyecto multi-tenant (destino)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Qué NO hace, a propósito:
 *   - No toca el origen. Es una copia; si algo sale mal, la base vieja sigue
 *     entera.
 *   - No mueve las imágenes. Los productos quedan apuntando a las URLs del
 *     proyecto viejo, que sigue vivo y sirviéndolas. El paso de storage es
 *     después y ya existe:
 *       scripts/migrar-imagenes-a-carpeta-negocio.ts --negocio=ninja-camisetas
 *     Ese orden importa: primero tiene que haber filas con URLs para que el
 *     script de imágenes tenga qué reescribir.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

cargarEnv(".env.local");

const APLICAR = process.argv.includes("--aplicar");
const NEGOCIO_SLUG = "ninja-camisetas";

const ORIGEN_URL = requerido("ORIGEN_SUPABASE_URL");
const ORIGEN_KEY = requerido("ORIGEN_SERVICE_ROLE_KEY");
const DESTINO_URL = requerido("NEXT_PUBLIC_SUPABASE_URL");
const DESTINO_KEY = requerido("SUPABASE_SERVICE_ROLE_KEY");

const origen = createClient(ORIGEN_URL, ORIGEN_KEY, {
  auth: { persistSession: false },
});
const destino = createClient(DESTINO_URL, DESTINO_KEY, {
  auth: { persistSession: false },
});

/**
 * `productos.tipo` del origen -> categoría en el destino. El orden es el que
 * se va a ver en el catálogo.
 */
const CATEGORIAS_POR_TIPO: Record<string, string> = {
  local: "Local",
  visitante: "Visitante",
  alternativa: "Alternativa",
  retro: "Retro",
};

/**
 * Los talles del origen son estos siete y nada más (7 filas por producto,
 * siempre). El orden es el de la remera, no el alfabético: se guarda en
 * atributo_valores.orden para que el selector del POS y del catálogo salga
 * en el orden que espera una persona.
 */
const TALLES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

interface ProductoOrigen {
  id: string;
  nombre: string;
  temporada: string;
  tipo: string | null;
  precio: number;
  precio_costo: number;
  imagen_url: string | null;
  publicado: boolean;
  slug: string | null;
  creado_en: string;
}

interface StockOrigen {
  id: string;
  producto_id: string | null;
  variante: string;
  cantidad: number;
}

interface VentaOrigen {
  id: string;
  producto_id: string | null;
  variante: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  fecha_venta: string;
  precio_costo: number;
}

async function main() {
  console.log(
    `\n=== Migración de Ninja Camisetas ===\n` +
      `Origen : ${ORIGEN_URL}\n` +
      `Destino: ${DESTINO_URL}\n` +
      `Modo   : ${APLICAR ? "APLICAR (escribe)" : "DRY-RUN (no escribe nada)"}\n`,
  );

  // 1. El negocio ya tiene que estar creado.
  const { data: negocio, error: errNegocio } = await destino
    .from("negocios")
    .select("id, nombre, slug")
    .eq("slug", NEGOCIO_SLUG)
    .maybeSingle();
  if (errNegocio) throw errNegocio;
  if (!negocio) {
    console.error(
      `✗ No existe un negocio con slug "${NEGOCIO_SLUG}" en el destino.\n` +
        `  Creálo primero desde el panel de super admin.`,
    );
    process.exit(1);
  }
  const negocioId = negocio.id as string;
  console.log(`Negocio: ${negocio.nombre} (${negocioId})`);

  // 2. Guarda de idempotencia. Correr esto dos veces duplicaría el catálogo
  // entero, y como los ids se conservan, la segunda corrida fallaría a mitad
  // de camino dejando todo a medias. Mejor no arrancar.
  const { count: yaHay, error: errCount } = await destino
    .from("productos")
    .select("*", { count: "exact", head: true })
    .eq("negocio_id", negocioId);
  if (errCount) throw errCount;
  if ((yaHay ?? 0) > 0) {
    console.error(
      `\n✗ El negocio ya tiene ${yaHay} productos. La migración es de una sola\n` +
        `  vez: para rehacerla hay que limpiar sus datos primero (en orden\n` +
        `  inverso a las FKs), no volver a correr esto encima.`,
    );
    process.exit(1);
  }

  // 3. El dueño del negocio: es a quien se le imputan el turno y las ventas
  // históricas. No hay otro usuario en Ninja.
  const { data: membresia, error: errMembresia } = await destino
    .from("usuarios_negocios")
    .select("usuario_id, es_owner")
    .eq("negocio_id", negocioId)
    .order("es_owner", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errMembresia) throw errMembresia;
  if (!membresia) {
    console.error("✗ El negocio no tiene ningún usuario asociado.");
    process.exit(1);
  }
  const vendedorId = membresia.usuario_id as string;

  // 4. Lectura del origen.
  const productos = await leerTodo<ProductoOrigen>("productos");
  const stock = await leerTodo<StockOrigen>("productos_stock");
  const ventas = await leerTodo<VentaOrigen>("ventas");

  const tiposUsados = [...new Set(productos.map((p) => (p.tipo ?? "").toLowerCase()))]
    .filter(Boolean)
    .sort();
  const talleDesconocido = [
    ...new Set(stock.map((s) => s.variante).filter((v) => !TALLES.includes(v))),
  ];

  console.log(
    `\nEn el origen:\n` +
      `  productos          ${productos.length}\n` +
      `  variantes (stock)  ${stock.length}\n` +
      `  unidades en stock  ${stock.reduce((a, s) => a + s.cantidad, 0)}\n` +
      `  ventas             ${ventas.length}\n` +
      `  tipos              ${tiposUsados.join(", ")}\n`,
  );

  if (talleDesconocido.length > 0) {
    console.error(
      `✗ Hay talles que no están en la lista conocida: ${talleDesconocido.join(", ")}.\n` +
        `  Agregalos a TALLES (en el orden correcto) antes de seguir.`,
    );
    process.exit(1);
  }

  const tiposSinCategoria = tiposUsados.filter((t) => !CATEGORIAS_POR_TIPO[t]);
  if (tiposSinCategoria.length > 0) {
    console.error(
      `✗ Tipos sin categoría mapeada: ${tiposSinCategoria.join(", ")}.\n` +
        `  Agregalos a CATEGORIAS_POR_TIPO antes de seguir.`,
    );
    process.exit(1);
  }

  // Una venta cuyo producto ya no existe no puede migrarse: ventas_items
  // tiene FK contra productos.
  const idsProductos = new Set(productos.map((p) => p.id));
  const ventasHuerfanas = ventas.filter(
    (v) => !v.producto_id || !idsProductos.has(v.producto_id),
  );
  const ventasMigrables = ventas.filter(
    (v) => v.producto_id && idsProductos.has(v.producto_id),
  );

  console.log(
    `Se va a escribir en el destino:\n` +
      `  categorias                  ${tiposUsados.length}\n` +
      `  atributos                   1 (Talle)\n` +
      `  atributo_valores            ${TALLES.length}\n` +
      `  productos                   ${productos.length}\n` +
      `  producto_variantes          ${stock.length}\n` +
      `  producto_variante_valores   ${stock.length}\n` +
      `  productos_stock (espejo)    ${stock.length}\n` +
      `  turnos_caja                 ${ventasMigrables.length > 0 ? 1 : 0}\n` +
      `  ventas                      ${ventasMigrables.length}\n` +
      `  ventas_items                ${ventasMigrables.length}\n` +
      `  venta_pagos                 ${ventasMigrables.length}\n`,
  );

  if (ventasHuerfanas.length > 0) {
    console.warn(
      `  ⚠ ${ventasHuerfanas.length} venta(s) apuntan a un producto que ya no existe: se saltean.`,
    );
  }

  if (!APLICAR) {
    const ejemplo = productos[0];
    if (ejemplo) {
      console.log(
        `Ejemplo de producto:\n` +
          `  "${ejemplo.nombre}" + "${ejemplo.temporada}" (${ejemplo.tipo})\n` +
          `    -> nombre    "${nombreCompuesto(ejemplo)}"\n` +
          `    -> categoría "${CATEGORIAS_POR_TIPO[(ejemplo.tipo ?? "").toLowerCase()]}"\n`,
      );
    }
    console.log("Dry-run: no se escribió nada. Repetí con --aplicar.\n");
    return;
  }

  // -------------------------------------------------------------------------
  // A partir de acá se escribe en el destino.
  // -------------------------------------------------------------------------
  // Todas las inserciones llevan negocio_id explícito: el default de la
  // columna es security.current_negocio_id(), que con la service role key no
  // resuelve a nada.

  // 5. Categorías.
  const categoriaPorTipo = new Map<string, string>();
  const filasCategorias = tiposUsados.map((tipo, i) => ({
    nombre: CATEGORIAS_POR_TIPO[tipo],
    slug: slugify(CATEGORIAS_POR_TIPO[tipo]),
    orden: i,
    activa: true,
    negocio_id: negocioId,
  }));
  const { data: catsCreadas, error: errCats } = await destino
    .from("categorias")
    .insert(filasCategorias)
    .select("id, nombre");
  if (errCats) throw errCats;
  for (const tipo of tiposUsados) {
    const fila = (catsCreadas ?? []).find(
      (c) => c.nombre === CATEGORIAS_POR_TIPO[tipo],
    );
    if (fila) categoriaPorTipo.set(tipo, fila.id as string);
  }
  console.log(`✓ Categorías: ${categoriaPorTipo.size}`);

  // 6. Atributo Talle y sus valores. Se usa el mismo nombre/slug que en los
  // otros comercios de indumentaria ("Talle" / "talle"): la normalización de
  // atributos cruza por ahí.
  const { data: atributo, error: errAtributo } = await destino
    .from("atributos")
    .insert({
      nombre: "Talle",
      slug: "talle",
      tipo: "TEXT",
      orden: 0,
      activo: true,
      negocio_id: negocioId,
    })
    .select("id")
    .single();
  if (errAtributo) throw errAtributo;
  const atributoId = atributo.id as string;

  const { data: valoresCreados, error: errValores } = await destino
    .from("atributo_valores")
    .insert(
      TALLES.map((talle, i) => ({
        atributo_id: atributoId,
        valor: talle,
        slug: slugify(talle),
        orden: i,
        activo: true,
        negocio_id: negocioId,
      })),
    )
    .select("id, valor");
  if (errValores) throw errValores;
  const valorPorTalle = new Map(
    (valoresCreados ?? []).map((v) => [v.valor as string, v.id as string]),
  );
  console.log(`✓ Atributo Talle con ${valorPorTalle.size} valores`);

  // 7. Productos. Se conservan los ids del origen: es trazabilidad gratis
  // contra la base vieja, que queda ahí para consultar.
  const filasProductos = productos.map((p) => ({
    id: p.id,
    nombre: nombreCompuesto(p),
    precio: p.precio,
    precio_costo: p.precio_costo,
    // Las URLs siguen apuntando al proyecto viejo hasta que corra el script
    // de imágenes. Se copia el valor tal cual (es un array JSON serializado).
    imagen_url: p.imagen_url,
    publicado: p.publicado,
    slug: p.slug,
    categoria_id: categoriaPorTipo.get((p.tipo ?? "").toLowerCase()) ?? null,
    creado_en: p.creado_en,
    negocio_id: negocioId,
  }));
  await insertarEnLotes("productos", filasProductos);
  console.log(`✓ Productos: ${filasProductos.length}`);

  // 8. Variantes. Una por fila de stock del origen. El id se genera acá para
  // poder armar producto_variante_valores sin releer.
  const filasVariantes = stock.map((s) => ({
    id: crypto.randomUUID(),
    producto_id: s.producto_id!,
    nombre_display: s.variante,
    atributos: { Talle: s.variante },
    // precio y costo van null a propósito: la variante hereda los del
    // producto, que es como quedan las variantes de los otros comercios.
    precio: null,
    costo: null,
    stock: s.cantidad,
    stock_minimo: 0,
    activa: true,
    negocio_id: negocioId,
  }));
  await insertarEnLotes("producto_variantes", filasVariantes);
  console.log(`✓ Variantes: ${filasVariantes.length}`);

  await insertarEnLotes(
    "producto_variante_valores",
    filasVariantes.map((v) => ({
      variante_id: v.id,
      atributo_id: atributoId,
      atributo_valor_id: valorPorTalle.get(v.nombre_display)!,
      negocio_id: negocioId,
    })),
  );
  console.log(`✓ Relación variante-valor: ${filasVariantes.length}`);

  // 9. Espejo legacy. Se escribe con el texto del origen sin normalizar, que
  // es la regla de productos_stock.
  await insertarEnLotes(
    "productos_stock",
    stock.map((s) => ({
      producto_id: s.producto_id,
      variante: s.variante,
      cantidad: s.cantidad,
      negocio_id: negocioId,
    })),
  );
  console.log(`✓ Stock espejo: ${stock.length}`);

  // 10. Ventas históricas.
  //
  // El stock del origen YA viene con estas ventas descontadas, así que acá se
  // escribe sólo el histórico: no se toca el stock que se cargó recién.
  //
  // El turno es sintético. En Comerz una venta cuelga de un turno de caja, y
  // en la base vieja no existía el concepto; se arma uno solo, cerrado, que
  // cubre el día de las ventas. Queda como turno cerrado, o sea inmutable.
  if (ventasMigrables.length > 0) {
    const { data: metodo, error: errMetodo } = await destino
      .from("metodos_pago")
      .select("id, nombre, tipo, comision, acreditacion_dias")
      .eq("negocio_id", negocioId)
      .eq("tipo", "EFECTIVO")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    if (errMetodo) throw errMetodo;
    if (!metodo) {
      throw new Error(
        "El negocio no tiene un método de pago EFECTIVO activo: hace falta para imputar las ventas históricas.",
      );
    }

    const fechas = ventasMigrables
      .map((v) => new Date(v.fecha_venta).getTime())
      .sort((a, b) => a - b);
    const totalVendido = ventasMigrables.reduce((a, v) => a + Number(v.total), 0);

    const { data: turno, error: errTurno } = await destino
      .from("turnos_caja")
      .insert({
        vendedor_id: vendedorId,
        abierta_por: vendedorId,
        cerrada_por: vendedorId,
        // Un minuto de margen a cada lado para que ninguna venta quede fuera
        // del rango del turno por redondeo de milisegundos.
        fecha_apertura: new Date(fechas[0] - 60_000).toISOString(),
        fecha_cierre: new Date(fechas.at(-1)! + 60_000).toISOString(),
        estado: "CERRADO",
        modo: "UNICA",
        monto_inicial: 0,
        monto_final: totalVendido,
        efectivo_esperado: totalVendido,
        monto_declarado: totalVendido,
        diferencia: 0,
        observacion_cierre:
          "Turno generado por la migración desde el sistema anterior. No corresponde a una caja real.",
        negocio_id: negocioId,
      })
      .select("id")
      .single();
    if (errTurno) throw errTurno;
    const turnoId = turno.id as string;

    await insertarEnLotes(
      "ventas",
      ventasMigrables.map((v) => ({
        id: v.id,
        cantidad: v.cantidad,
        precio_costo: v.precio_costo,
        fecha_venta: v.fecha_venta,
        vendedor_id: vendedorId,
        metodo_pago: "EFECTIVO",
        total: v.total,
        total_bruto: v.total,
        comision_total: 0,
        total_neto: v.total,
        recargo_metodo_total: 0,
        es_pago_mixto: false,
        estado_pago: "PAGADA",
        monto_cobrado: v.total,
        monto_pendiente: 0,
        turno_caja_id: turnoId,
        estado_operacion: "CONFIRMADA",
        negocio_id: negocioId,
      })),
    );

    await insertarEnLotes(
      "ventas_items",
      ventasMigrables.map((v) => ({
        venta_id: v.id,
        producto_id: v.producto_id,
        variante: v.variante,
        cantidad: v.cantidad,
        precio_unitario: v.precio_unitario,
        precio_costo: v.precio_costo,
        descuento_monto: 0,
        precio_final: v.total,
        negocio_id: negocioId,
      })),
    );

    // Efectivo: sin comisión y sin recargo, así que bruto = base = neto. Se
    // mantiene igual la invariante monto_bruto = monto_base + recargo_monto.
    await insertarEnLotes(
      "venta_pagos",
      ventasMigrables.map((v) => ({
        venta_id: v.id,
        metodo_pago_id: metodo.id,
        metodo_nombre: metodo.nombre,
        metodo_tipo: metodo.tipo,
        monto_base: v.total,
        recargo_porcentaje: 0,
        recargo_monto: 0,
        monto_bruto: v.total,
        comision_porcentaje: 0,
        comision_monto: 0,
        monto_neto: v.total,
        acreditacion_dias: metodo.acreditacion_dias ?? 0,
        tipo_movimiento: "PAGO_VENTA",
        estado_pago_operacion: "CONFIRMADO",
        turno_caja_id: turnoId,
        creado_en: v.fecha_venta,
        negocio_id: negocioId,
      })),
    );

    console.log(
      `✓ Ventas históricas: ${ventasMigrables.length} (turno sintético ${turnoId})`,
    );
  }

  console.log(
    `\n✓ Migración terminada.\n` +
      `  Catálogo público: /store/${NEGOCIO_SLUG}\n` +
      `  Falta mover las imágenes (hoy se sirven desde el proyecto viejo):\n` +
      `    node --experimental-strip-types scripts/migrar-imagenes-a-carpeta-negocio.ts --negocio=${NEGOCIO_SLUG} --aplicar\n`,
  );
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * "Atlético de Madrid" + "1999/2000" -> "Atlético de Madrid 1999/2000".
 * La temporada va en el nombre porque el mismo club aparece en varias y sin
 * eso quedan productos indistinguibles en el buscador del POS.
 */
function nombreCompuesto(p: ProductoOrigen): string {
  const temporada = (p.temporada ?? "").trim();
  return temporada ? `${p.nombre.trim()} ${temporada}` : p.nombre.trim();
}

/** Lee una tabla entera del origen, paginando. */
async function leerTodo<T>(tabla: string): Promise<T[]> {
  const LOTE = 1000;
  const filas: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await origen
      .from(tabla)
      .select("*")
      .range(desde, desde + LOTE - 1);
    if (error) throw new Error(`[origen.${tabla}] ${error.message}`);
    if (!data || data.length === 0) break;
    filas.push(...(data as T[]));
    if (data.length < LOTE) break;
  }
  return filas;
}

async function insertarEnLotes(tabla: string, filas: Record<string, unknown>[]) {
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await destino.from(tabla).insert(filas.slice(i, i + LOTE));
    if (error) throw new Error(`[destino.${tabla}] ${error.message}`);
  }
}

/** Copia de shared/utils/slugify.ts — el script corre suelto, sin el bundler. */
function slugify(texto: string): string {
  return String(texto)
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9 -]/g, " ")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-");
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
  console.error("\n✗ La migración falló:", error.message ?? error);
  console.error(
    "  El origen no se tocó. En el destino puede haber quedado el catálogo a\n" +
      "  medias: hay que limpiarlo (en orden inverso a las FKs) antes de\n" +
      "  reintentar — la guarda de idempotencia no deja correr esto dos veces.",
  );
  process.exit(1);
});
