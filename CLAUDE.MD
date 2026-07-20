# Cobox POS — Contexto del proyecto

POS + catálogo público para comercios (cliente piloto: Evens Indumentaria,
Tostado, Santa Fe). Next.js + TypeScript + Supabase (proyecto prod:
pwrvyfavqkyyprdgyxuk / cobox-pos). Deploy: Vercel, branch main.
EN PRODUCCIÓN REAL: la dueña (Evelyn, admin) y 3 vendedoras (Mara, Brisa,
Zunilda) lo usan a diario. Cualquier cambio que toque ventas/caja/stock
es plata real.

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

## Estado al 19/7/2026 (domingo)

- PENDIENTE DE PUSH (decisión consciente del dueño, pushear lunes a
  primera hora): fix transaccional guardar_variantes_producto + FK de
  auditoría + modal de confirmación de variantes. Hasta ese push, editar
  productos con variantes en prod puede seguir borrando filas.
- La dueña debe recargar a mano el stock perdido de CAMISETA ARGENTINA:
  variantes M, L, 16 y Talle 10 (2 unidades) — irrecuperables.
- En curso: fix de cuenta corriente + método de pago (causa confirmada:
  condición `anticipoActual > 0` con cc_anticipo_default=0 oculta la
  sección; el fix es mostrarla siempre en CC, y no auto-seleccionar
  método en CC), y el historial de movimientos por producto (fuentes
  confirmadas: ventas, remitos, bajas con columna origen nueva
  MANUAL/DEVOLUCION_VENTA, restauración por anulación como INGRESO
  "Devolución de cliente", y auditoría ELIMINADA como egreso).
