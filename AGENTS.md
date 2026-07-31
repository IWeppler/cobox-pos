# Cobox POS — Contexto del proyecto

POS + catálogo público para comercios (Tostado, Santa Fe). Next.js +
TypeScript + Supabase. Deploy: Vercel, branch main.
EN PRODUCCIÓN REAL: en Evens la dueña (Evelyn, admin) y 3 vendedoras (Mara,
Brisa, Zunilda) lo usan a diario. Cualquier cambio que toque ventas/caja/stock
es plata real.

## Tres comercios, tres bases, UN repo

Modelo por-proyecto (todavía NO multi-tenant): mismo código, una base Supabase
por comercio. `supabase/migrations/` es carpeta COMPARTIDA — toda migración se
aplica a las 3 bases o se genera drift. Nunca detección de comercio en runtime.

| MCP ref | Comercio | Rubro |
|---|---|---|
| `evens-project` | Evens Indumentaria | indumentaria |
| `estilo-bonito-project` | Estilo Bonito | indumentaria |
| `click-project` | ClickTostado | electro |

El drift es el riesgo #1 de este modelo (ver "Aprendizajes"). Antes de tocar
schema: chequear las 3, aplicar a las 3, verificar en las 3.

## Regla de trabajo más importante (aprendida a los golpes)

Un cambio que toca código + schema NO está terminado hasta confirmar las
3 cosas: (1) migración aplicada en Supabase prod, (2) código commiteado,
pusheado Y deploy de Vercel exitoso, (3) smoke test real en producción.
Esta semana hubo 3 incidentes por confirmar solo una pata.

## Arquitectura y decisiones clave

- `producto_variantes` es la fuente canónica (atributos JSONB + relación
  producto_variante_valores). `productos_stock` es espejo legacy: se
  mantiene sincronizado en cada escritura, NUNCA se normaliza su texto.
- Stock se descuenta con UPDATE atómico condicional vía RPC
  `ajustar_stock_variante` (por variante_id, nunca por nombre).
- Precios se revalidan server-side en create-sale.ts (nunca confiar en
  el precio que manda el cliente). Mismo criterio para todo lo que toque
  plata: validación espejo en el server siempre.
- RBAC: roles ADMIN/ENCARGADO/VENDEDOR + tabla permisos + función
  `tiene_permiso(clave)` (generaliza `is_admin()`, que sigue vigente).
  perfiles.rol (texto legacy) se mantiene sincronizado — ENCARGADO se
  mapea a 'VENDEDOR' en el texto hasta terminar el cableado.
- Multicaja POR_USUARIO: cada vendedor ve/cierra SOLO su turno
  (matching estricto vendedor_id === userId). Admin ve todas. Turno
  cerrado es inmutable para todos.
- Ediciones de producto: TODO el ciclo de variantes (chequeo + delete +
  reinsert + auditoría) corre en la RPC transaccional
  `guardar_variantes_producto`. Freno: si el payload trae menos
  variantes de las que existen, se rechaza el guardado.
- Auditoría: `actualizaciones_precio_items` (precios, con variante_id) y
  `producto_variantes_auditoria` (snapshots por guardado, acción
  CREADA/ACTUALIZADA/ELIMINADA/BLOQUEADO_FALTANTE, SIN FK dura — debe
  sobrevivir a la desaparición del original).
- Catálogo público: RLS de SELECT para anon en producto_variantes y
  promociones ya aplicadas (fueron la causa de bugs silenciosos).
- Promociones: condición (tipo_regla, puede ser null=sin condición) y
  visibilidad (mostrar_en_catalogo) son ejes INDEPENDIENTES. Fail-closed:
  tipo_regla desconocido = NO elegible.
- Normalización de atributos: siempre vía normalizarAtributoKeyValor /
  canonicalizarValores (slugify compartido) — en creación manual Y en
  conciliación de remitos (merge-purchase.ts).
- Aprobación de remitos: TODO (precios + stock + alias + estado) corre en la
  RPC `aprobar_orden_compra`, en una transacción y en batch (antes era un for
  con await adentro: ~1500 round-trips en el remito más grande). El guard de
  idempotencia (`update ... where estado <> 'APROBADA'` + `if not found`) va
  PRIMERO, antes de escribir stock: toma el row lock que serializa dos
  aprobaciones concurrentes y devuelve `{ya_aprobada: true}` como resultado
  normal, no como excepción. La canonicalización de atributos se queda en
  Node a propósito; la RPC recibe `atributos` ya canonicalizado.
- Métodos de pago, dos porcentajes que NO son lo mismo: `comision` es lo que
  el comercio le paga al procesador (se resta, interno) y `recargo_porcentaje`
  es lo que le cobra al cliente (se suma, se muestra). El cálculo vive en
  `shared/lib/recargo-metodo.ts` y lo comparten POS y server; el server SIEMPRE
  recalcula desde la base. Invariante: `venta_pagos.monto_bruto = monto_base +
  recargo_monto`, donde la base es lo que imputa al ticket o a la deuda — la
  deuda de cuenta corriente baja por base, nunca por bruto. El recargo se
  aplica por método sobre SU porción del pago (mixto), se redondea al peso, y
  queda congelado en la fila del pago. La comisión se calcula sobre el bruto
  (es lo que pasa por el posnet). anon lee `recargo_porcentaje` para el
  catálogo público vía policy + GRANT por columna: `comision` NO se expone.
- Rubro: flag `configuracion_pos.rubro` ('indumentaria' | 'electro', CHECK
  fail-closed, default indumentaria). Cambia la identidad del producto en la
  UI, no el schema: indumentaria muestra "N var.", electro muestra Modelo +
  EAN (`features/stock/lib/identidad-por-rubro.ts`). El EAN vive en
  `producto_variantes.sku` — misma columna, otro label.
- Catálogo Maestro (`catalogo_maestro`): tabla de fichas de electro que vive
  en OTRO proyecto Supabase, solo-lectura por RLS (no hay política de
  INSERT/UPDATE/DELETE: anon y authenticated no escriben ni por error).
  Carga Rápida busca por EAN exacto y por texto (word_similarity + ranking,
  porque word_similarity sola satura en 1.000). Los datos se COPIAN al
  producto local; `productos.id_master` es trazabilidad SIN FK — la venta
  nunca depende de alcanzar el maestro en tiempo real.
- Categorías en árbol de 2 niveles (parent_id), tolerante a estado mixto:
  padres con hijos, sueltas sin padre, o todo plano. `shared/utils/
  category-tree.ts` separa resolución de slug (sin conteos, para que un link
  viejo resuelva igual) de construcción del árbol (con conteos y facetado).
- RLS: el baseline real de producción está versionado desde
  `20260728130000_rls_baseline_desde_evens.sql` (antes el repo cubría 7 de 34
  tablas; las 88 políticas vivas nunca habían estado en git).

## Aprendizajes que ya costaron plata (no repetir)

- **Timeout de UI ≠ cancelación de server action.** `withTimeout` solo rechaza
  la promesa del cliente; el server sigue hasta el final. Nunca envolver en
  `withTimeout` una acción que muta stock o plata (ver comentario en
  merge-table.tsx). Incidente 27/7 en Estilo Bonito: 8 reintentos = stock ×8
  (1960 unidades donde iban 245).
- **UPDATE condicional + chequeo de filas afectadas ANTES de cualquier
  escritura derivada.** Mismo bug apareció en cancel-sale.ts (reembolso
  fantasma) y en aprobar_orden_compra. Un `select` previo NO sirve: dos
  llamadas concurrentes leen lo mismo y las dos escriben.
- **Un cambio no está terminado hasta las 3 patas** (migración en las 3 bases +
  push con deploy verde + smoke test real). Regla arriba del todo.
- **Drift por-proyecto.** Cada categoría de schema (políticas, constraints,
  columnas, seeds) se rompe por separado en cada base. Todo lo que se aplica
  a mano en una base y no queda como migración, se pierde.

## Estado al 30/7/2026 (jueves)

Hecho y en producción en las 3 bases:

- Idempotencia de aprobación de remitos (guard + `ya_aprobada` consumido por
  merge-purchase.ts / merge-table.tsx) — aplicado en las 3, smoke test OK.
- Baseline de RLS versionado, fix de drift de configuración y del trigger de
  turno cerrado, `thumbnail_url`, `rubro` + `modelo`, `id_master`.
- Catálogo Maestro + búsqueda por texto; Carga Rápida con picker de maestro,
  prefill y quick-create.
- Merge de remitos: sugerencias de match y de categoría, umbral y audiencia,
  clasificación de match (T1/T2/T3). Gotcha visto en datos reales:
  `estado_match` guardado puede quedar stale.
- Categorías en árbol (Evens ya no es catálogo plano; REGLAS_CATEGORIA quedó
  obsoleto y silencioso).
- Seed de métodos de pago default; CC + método de pago (la sección se muestra
  siempre en CC y no se auto-selecciona método); historial de movimientos por
  producto (`features/stock/ui/movimientos-table.tsx`).

Próximo: plan multicomercio y la decisión de arquitectura SaaS (multi-tenant
`negocio_id` vs. seguir por-proyecto con provisioning automatizado) — está en
ROADMAP.md, TIER 2, y es la decisión que conviene tomar antes del 4º cliente.
