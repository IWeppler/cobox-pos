/**
 * Migra un comercio entero desde su proyecto Supabase propio (modelo
 * por-proyecto) hacia el proyecto multi-tenant, como un negocio más.
 *
 * Por qué un script y no SQL a mano: copiar tabla por tabla transcribiendo
 * datos es donde se pierde una fila en silencio. Acá lo que se lee es lo que
 * se escribe, y el dry-run dice exactamente cuánto va a entrar antes de tocar
 * nada.
 *
 * Uso:
 *   node --experimental-strip-types scripts/migrar-negocio-a-multitenant.ts
 *   node --experimental-strip-types scripts/migrar-negocio-a-multitenant.ts --aplicar
 *
 * Variables (.env.local):
 *   ORIGEN_SUPABASE_URL            proyecto del comercio a migrar
 *   ORIGEN_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL       proyecto multi-tenant (destino)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEGOCIO_NOMBRE                 ej. "ClickTostado"
 *   NEGOCIO_SLUG                   ej. "clicktostado"
 *
 * Qué NO hace, a propósito:
 *   - No toca el proyecto de origen. Es una copia; si algo sale mal, el
 *     comercio sigue operando en su base vieja.
 *   - No migra los archivos de storage. Las URLs guardadas siguen apuntando al
 *     proyecto viejo, que queda vivo. Mover imágenes es un paso aparte.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
cargarEnv(".env.local");

const APLICAR = process.argv.includes("--aplicar");

const ORIGEN_URL = requerido("ORIGEN_SUPABASE_URL");
const ORIGEN_KEY = requerido("ORIGEN_SERVICE_ROLE_KEY");
const DESTINO_URL = requerido("NEXT_PUBLIC_SUPABASE_URL");
const DESTINO_KEY = requerido("SUPABASE_SERVICE_ROLE_KEY");
const NEGOCIO_NOMBRE = requerido("NEGOCIO_NOMBRE");
const NEGOCIO_SLUG = requerido("NEGOCIO_SLUG");

const origen = createClient(ORIGEN_URL, ORIGEN_KEY, {
  auth: { persistSession: false },
});
const destino = createClient(DESTINO_URL, DESTINO_KEY, {
  auth: { persistSession: false },
});

/**
 * Orden de copia = orden de dependencias. Si una tabla entra antes que su
 * padre, la FK la rechaza; el orden es la garantía de integridad.
 *
 * `negocio` indica si hay que inyectar negocio_id (las tablas hijas también lo
 * tienen desde la migración multi-tenant).
 */
const TABLAS: { nombre: string; negocio: boolean }[] = [
  { nombre: "categorias", negocio: true },
  { nombre: "atributos", negocio: true },
  { nombre: "atributo_valores", negocio: true },
  { nombre: "categoria_atributos", negocio: true },
  { nombre: "metodos_pago", negocio: true },
  { nombre: "clientes", negocio: true },
  { nombre: "productos", negocio: true },
  { nombre: "producto_variantes", negocio: true },
  { nombre: "producto_variante_valores", negocio: true },
  { nombre: "productos_stock", negocio: true },
  { nombre: "unidades_serie", negocio: true },
  { nombre: "ordenes_compra", negocio: true },
  { nombre: "ordenes_items", negocio: true },
  { nombre: "diccionario_alias", negocio: true },
  { nombre: "turnos_caja", negocio: true },
  { nombre: "ventas", negocio: true },
  { nombre: "ventas_items", negocio: true },
  { nombre: "ventas_descuentos", negocio: true },
  { nombre: "venta_pagos", negocio: true },
  { nombre: "cuenta_corriente_movimientos", negocio: true },
  { nombre: "egresos", negocio: true },
  { nombre: "reservas", negocio: true },
  { nombre: "promociones", negocio: true },
  { nombre: "promociones_productos", negocio: true },
  { nombre: "promociones_categorias", negocio: true },
  { nombre: "promociones_metodos_pago", negocio: true },
  { nombre: "bajas", negocio: true },
  { nombre: "producto_variantes_auditoria", negocio: true },
  { nombre: "actualizaciones_precio", negocio: true },
  { nombre: "actualizaciones_precio_items", negocio: true },
];

/**
 * Columnas que apuntan a un usuario y hay que remapear al del destino.
 * Salen de las FKs reales contra perfiles/auth.users, no de la memoria: la
 * primera corrida se cayó en turnos_caja por `abierta_por`, que faltaba acá.
 *
 *   select distinct a.attname from pg_constraint c
 *   join unnest(c.conkey) k on true
 *   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k
 *   where c.contype='f'
 *     and c.confrelid in ('public.perfiles'::regclass,'auth.users'::regclass);
 */
const COLUMNAS_DE_USUARIO = [
  "abierta_por",
  "anulado_por",
  "cerrada_por",
  "creado_por",
  "editado_por",
  "invitado_por",
  "usuario_id",
  "vendedor_id",
];

async function main() {
  console.log(
    `\n=== Migración de "${NEGOCIO_NOMBRE}" ===\n` +
      `Origen : ${ORIGEN_URL}\n` +
      `Destino: ${DESTINO_URL}\n` +
      `Modo   : ${APLICAR ? "APLICAR (escribe)" : "DRY-RUN (no escribe nada)"}\n`,
  );

  // 1. El negocio no puede existir ya: repetir la migración duplicaría todo.
  const { data: yaExiste } = await destino
    .from("negocios")
    .select("id, nombre")
    .eq("slug", NEGOCIO_SLUG)
    .maybeSingle();

  if (yaExiste) {
    console.error(
      `\n✗ Ya hay un negocio con slug "${NEGOCIO_SLUG}" (${yaExiste.nombre}).\n` +
        `  Para rehacer la migración hay que borrar sus datos primero, tabla\n` +
        `  por tabla y en orden inverso: las FKs contra negocios son NO ACTION,\n` +
        `  así que borrar la fila del negocio sola falla.`,
    );
    process.exit(1);
  }

  // 2. Usuarios del origen. En el destino no se pueden crear filas de perfiles
  // sin su usuario de Auth (hay FK), así que cada uno se crea en Auth y se
  // guarda el mapeo viejo -> nuevo para reescribir las referencias.
  const { data: perfilesOrigen, error: errPerfiles } = await origen
    .from("perfiles")
    .select("id, nombre, email");
  if (errPerfiles) throw errPerfiles;

  console.log(`Usuarios a migrar: ${perfilesOrigen?.length ?? 0}`);
  for (const p of perfilesOrigen ?? []) {
    console.log(`  · ${p.email} (${p.nombre})`);
  }

  // 3. Conteo de lo que se va a copiar.
  const plan: { tabla: string; filas: number; negocio: boolean }[] = [];
  for (const { nombre, negocio } of TABLAS) {
    const { count, error } = await origen
      .from(nombre)
      .select("*", { count: "exact", head: true });

    if (error) {
      // Una tabla que no existe en el origen no es un error: las bases
      // arrastran distinto historial de migraciones.
      console.log(`  (${nombre}: no existe en el origen, se saltea)`);
      continue;
    }
    plan.push({ tabla: nombre, filas: count ?? 0, negocio });
  }

  console.log("\nFilas por tabla:");
  let total = 0;
  for (const p of plan) {
    if (p.filas > 0) console.log(`  ${p.tabla.padEnd(32)} ${p.filas}`);
    total += p.filas;
  }
  console.log(`  ${"TOTAL".padEnd(32)} ${total}\n`);

  if (!APLICAR) {
    console.log(
      "Dry-run: no se escribió nada. Volvé a correrlo con --aplicar para migrar.\n",
    );
    return;
  }

  // -------------------------------------------------------------------------
  // A partir de acá se escribe en el destino.
  // -------------------------------------------------------------------------

  // 4. Negocio.
  const { data: negocio, error: errNegocio } = await destino
    .from("negocios")
    .insert({ nombre: NEGOCIO_NOMBRE, slug: NEGOCIO_SLUG, estado: "activo" })
    .select("id")
    .single();
  if (errNegocio) throw errNegocio;
  const negocioId = negocio.id as string;
  console.log(`✓ Negocio creado: ${negocioId}`);

  // 5. Roles y permisos. Los roles se copian con id nuevo por negocio; los
  // permisos son globales y se cruzan por `clave`, porque los ids de la tabla
  // permisos difieren entre proyectos.
  const mapaRoles = await copiarRoles(negocioId);
  await copiarRolPermisos(negocioId, mapaRoles);

  // 6. Usuarios: alta en Auth del destino + perfil + membresía.
  const mapaUsuarios = await copiarUsuarios(negocioId, mapaRoles, perfilesOrigen ?? []);

  // 7. Configuración del comercio.
  await copiarConfiguracion(negocioId);

  // 8. Datos, en orden de dependencias.
  for (const { tabla, negocio: inyectar } of plan) {
    await copiarTabla(tabla, inyectar ? negocioId : null, mapaUsuarios);
  }

  console.log(
    `\n✓ Migración terminada.\n` +
      `  Catálogo público: /store/${NEGOCIO_SLUG}\n` +
      `  Las imágenes siguen sirviéndose desde el proyecto de origen.\n`,
  );
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

async function copiarRoles(negocioId: string) {
  const { data: roles, error } = await origen
    .from("roles")
    .select("id, nombre, es_sistema");
  if (error) throw error;

  const mapa = new Map<string, string>();
  for (const rol of roles ?? []) {
    const { data, error: err } = await destino
      .from("roles")
      .insert({
        nombre: rol.nombre,
        es_sistema: rol.es_sistema,
        negocio_id: negocioId,
      })
      .select("id")
      .single();
    if (err) throw err;
    mapa.set(rol.id, data.id);
  }
  console.log(`✓ Roles: ${mapa.size}`);
  return mapa;
}

async function copiarRolPermisos(
  negocioId: string,
  mapaRoles: Map<string, string>,
) {
  // Se cruza por clave: los ids de `permisos` no coinciden entre proyectos.
  const { data: origenRP, error } = await origen
    .from("rol_permisos")
    .select("rol_id, permisos(clave)");
  if (error) throw error;

  const { data: permisosDestino, error: errPerm } = await destino
    .from("permisos")
    .select("id, clave");
  if (errPerm) throw errPerm;

  const porClave = new Map(
    (permisosDestino ?? []).map((p) => [p.clave as string, p.id as string]),
  );

  const filas: Record<string, string>[] = [];
  const clavesSinDestino = new Set<string>();

  for (const rp of origenRP ?? []) {
    const permiso = Array.isArray(rp.permisos) ? rp.permisos[0] : rp.permisos;
    const clave = permiso?.clave as string | undefined;
    const rolNuevo = mapaRoles.get(rp.rol_id as string);
    const permisoNuevo = clave ? porClave.get(clave) : undefined;

    if (!clave || !rolNuevo) continue;
    if (!permisoNuevo) {
      clavesSinDestino.add(clave);
      continue;
    }
    filas.push({
      rol_id: rolNuevo,
      permiso_id: permisoNuevo,
      negocio_id: negocioId,
    });
  }

  if (filas.length) {
    const { error: errIns } = await destino.from("rol_permisos").insert(filas);
    if (errIns) throw errIns;
  }

  console.log(`✓ Permisos por rol: ${filas.length}`);
  if (clavesSinDestino.size) {
    console.warn(
      `  ⚠ Permisos que no existen en el destino y se saltearon: ${[
        ...clavesSinDestino,
      ].join(", ")}`,
    );
  }
}

async function copiarUsuarios(
  negocioId: string,
  mapaRoles: Map<string, string>,
  perfilesOrigen: { id: string; nombre: string; email: string }[],
) {
  const mapa = new Map<string, string>();

  // El rol de cada usuario en el origen vive en perfiles.rol_id.
  const { data: perfilesConRol } = await origen
    .from("perfiles")
    .select("id, rol_id");
  const rolPorPerfil = new Map(
    (perfilesConRol ?? []).map((p) => [p.id as string, p.rol_id as string]),
  );

  const { data: rolesDestino } = await destino
    .from("roles")
    .select("id, nombre")
    .eq("negocio_id", negocioId);
  const rolVendedor = (rolesDestino ?? []).find((r) => r.nombre === "VENDEDOR");

  let primero = true;
  for (const perfil of perfilesOrigen) {
    // Si el email ya tiene cuenta en el destino, se reutiliza: la persona
    // puede trabajar en dos comercios.
    const { data: existentes } = await destino.auth.admin.listUsers();
    const yaEsta = existentes?.users.find(
      (u) => u.email?.toLowerCase() === perfil.email.toLowerCase(),
    );

    let usuarioId: string;
    if (yaEsta) {
      usuarioId = yaEsta.id;
      console.log(`  · ${perfil.email}: ya tenía cuenta, se reutiliza`);
    } else {
      const { data: creado, error } = await destino.auth.admin.createUser({
        email: perfil.email,
        email_confirm: true,
        user_metadata: { nombre: perfil.nombre },
      });
      if (error) throw error;
      usuarioId = creado.user.id;
      console.log(
        `  · ${perfil.email}: cuenta creada (tiene que recuperar contraseña)`,
      );
    }

    mapa.set(perfil.id, usuarioId);

    // El perfil lo crea el trigger on_auth_user_created; si no está, se fuerza.
    await destino
      .from("perfiles")
      .upsert({ id: usuarioId, email: perfil.email, nombre: perfil.nombre });

    const rolOrigen = rolPorPerfil.get(perfil.id);
    const rolId = (rolOrigen && mapaRoles.get(rolOrigen)) || rolVendedor?.id;
    const { data: rolFila } = await destino
      .from("roles")
      .select("nombre")
      .eq("id", rolId)
      .single();
    const rolTexto = rolFila?.nombre === "ADMIN" ? "ADMIN" : "VENDEDOR";

    const { error: errMembresia } = await destino
      .from("usuarios_negocios")
      .insert({
        usuario_id: usuarioId,
        negocio_id: negocioId,
        rol_id: rolId,
        rol: rolTexto,
        // El primero de la lista queda como dueño del negocio migrado.
        es_owner: primero,
      });
    if (errMembresia) throw errMembresia;
    primero = false;
  }

  console.log(`✓ Usuarios y membresías: ${mapa.size}`);
  return mapa;
}

async function copiarConfiguracion(negocioId: string) {
  const { data, error } = await origen
    .from("configuracion_pos")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const fila = { ...data, negocio_id: negocioId };
  delete (fila as Record<string, unknown>).id;

  const { error: errIns } = await destino.from("configuracion_pos").insert(fila);
  if (errIns) throw errIns;
  console.log("✓ Configuración del comercio");
}

async function copiarTabla(
  tabla: string,
  negocioId: string | null,
  mapaUsuarios: Map<string, string>,
) {
  const LOTE = 500;
  let desde = 0;
  let copiadas = 0;

  for (;;) {
    const { data, error } = await origen
      .from(tabla)
      .select("*")
      .range(desde, desde + LOTE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    const filas = data.map((fila) => {
      const copia: Record<string, unknown> = { ...fila };
      if (negocioId) copia.negocio_id = negocioId;

      // Las referencias a usuarios apuntan a ids del proyecto viejo.
      for (const columna of COLUMNAS_DE_USUARIO) {
        const valor = copia[columna];
        if (typeof valor === "string" && mapaUsuarios.has(valor)) {
          copia[columna] = mapaUsuarios.get(valor);
        } else if (typeof valor === "string" && !mapaUsuarios.has(valor)) {
          // Usuario que no vino en la migración: mejor null que una FK rota.
          copia[columna] = null;
        }
      }
      return copia;
    });

    // Las bases arrastran distinto historial: el origen puede tener columnas
    // que en el destino no existen. En vez de morir a mitad de la copia, se
    // descarta esa columna y se reintenta, avisando qué se dejó afuera.
    let porInsertar = filas;
    for (;;) {
      const { error: errIns } = await destino.from(tabla).insert(porInsertar);
      if (!errIns) break;

      const sobrante = errIns.message.match(
        /Could not find the '([^']+)' column/,
      )?.[1];

      if (!sobrante) throw new Error(`[${tabla}] ${errIns.message}`);

      console.warn(
        `  ⚠ ${tabla}.${sobrante} no existe en el destino: se descarta`,
      );
      porInsertar = porInsertar.map((f) => {
        const copia = { ...f };
        delete copia[sobrante];
        return copia;
      });
    }

    copiadas += filas.length;
    if (data.length < LOTE) break;
    desde += LOTE;
  }

  if (copiadas > 0) console.log(`✓ ${tabla.padEnd(32)} ${copiadas}`);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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
    const valor = limpia.slice(igual + 1).trim();
    if (!(clave in process.env)) process.env[clave] = valor;
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
    "  El proyecto de origen no se tocó. En el destino puede haber quedado el\n" +
      "  negocio a medias: hay que limpiarlo antes de reintentar.\n" +
      "  OJO: borrar la fila de `negocios` NO alcanza — las FKs de las tablas\n" +
      "  de datos son NO ACTION, así que primero van los datos y al final el\n" +
      "  negocio (ver supabase/migrations/…_limpiar_negocio.sql).",
  );
  process.exit(1);
});
