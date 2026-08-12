# Auditoría de acceso anónimo — previa a `*.comerz.app`

Fecha: 11/8/2026. Base: proyecto único del SaaS (MCP ref `evens-project`).
Alcance: schema `public`, 47 tablas, rol `anon`.

## Por qué esto es bloqueante

La anon key es pública (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) y el tenant se
elige con un header (`x-negocio-slug`) que manda el cliente. Las dos cosas
juntas significan que **todo lo que `anon` pueda leer es público para los 4
negocios a la vez, con un `curl`** — no hace falta ni abrir el catálogo. Que la
UI no lo muestre no es control de acceso.

Los hallazgos de abajo están verificados ejecutando las consultas con
`set role anon` y el header de slug puesto, no leyendo policies.

---

## Hallazgos

### P0 — Tablas de backup abiertas a lectura Y ESCRITURA anónima ✅ RESUELTO

Cuatro tablas con **RLS apagado y cero policies**, más GRANT de
`SELECT/INSERT/UPDATE/DELETE` a `anon`. Sin RLS, el GRANT es lo único que hay:
cualquiera con la anon key podía leerlas y escribirlas.

| Tabla | Filas | Contiene |
|---|---|---|
| `_backup_broderie_20260731_variantes` | 36 | nombres, atributos, `stock` (`costo` y `precio` **null en todas**) |
| `_backup_broderie_20260731_stock` | 36 | cantidades |
| `_backup_broderie_20260731_alias` | 28 | alias de proveedor |
| `_backup_perfiles_deprecado_20260802` | 7 | `id`, `negocio_id`, `rol` |

**Cerrado el 11/8 con `20260811150000_archivar_backups_broderie.sql`**, aparte
de la migración de RLS porque no dependía del deploy del código: nada en la app
lee estas tablas.

Las tres de broderie **no eran copias redundantes** — de las 36 variantes sólo
11 seguían vivas, de los 28 alias sólo 2, de las 36 filas de stock sólo 9: eran
el único registro de lo que se borró al limpiar los duplicados del ingreso por
remito. Por eso se movieron al schema `archivo` (sin `USAGE` para `anon` ni
`authenticated`) en vez de dropearse; el dato queda intacto y vuelve con un
`alter table ... set schema public`.

`_backup_perfiles_deprecado_20260802` sí se dropeó: las 5 membresías reales
siguen en `usuarios_negocios` con el mismo rol, y las otras 2 filas tenían
`negocio_id` nulo (nunca fueron una membresía).

Verificado como `anon`: `permission denied for schema archivo`.

### P0 — El costo y el margen de todo el catálogo son públicos

`productos.precio_costo` y `producto_variantes.costo` están concedidos a `anon`
y las policies de lectura pública no los recortan. Verificado: **1.116 filas de
`productos` con `precio_costo` legibles** para el slug de Evens; lo mismo
aplica a los 506 de Estilo Bonito, 96 de Ninja y 11 de ClickTostado cambiando
un header.

No es sólo teórico: `getProductosAction` **pedía `precio_costo` explícitamente**
y lo mandaba al navegador de cualquier visitante del catálogo.

### P1 — Policies `{public} USING (true)` que anulan a las filtradas

El rol `public` incluye a `anon`. Una policy permisiva con `USING (true)` se
OR-ea con la policy filtrada y la deja sin efecto. Estaba pasando en:

- `categorias`: convivían `{anon} activa = true` y `{public} true`. Ganaba `true`.
- `productos`: `{public} true` sin filtro de `publicado`. Verificado: los **2
  productos no publicados de Ninja Camisetas** eran visibles para `anon`.
- `producto_variantes`, `productos_stock`, `producto_variante_valores`,
  `promociones` y sus 3 tablas hijas, `configuracion_pos`: misma forma.

### P1 — `configuracion_pos` entera al visitante

`anon` leía las **50 columnas**, incluidas `cuit`, `razon_social`,
`condicion_iva`, `inicio_actividades`, `punto_venta`, `modo_facturacion`
(identidad fiscal del comercio), `cc_limite_default` / `cc_recargo_default` /
`recargo_mora_*` (su política de crédito), `modo_caja`, `crm_dias_inactivo` y
`mensaje_ticket`. Las páginas de tienda hacían `select("*")`, así que todo eso
efectivamente viajaba al navegador.

### P1 — GRANT de escritura a `anon` en casi toda la base

`anon` tenía `INSERT`, `UPDATE`, `DELETE` y `REFERENCES` sobre prácticamente
todas las tablas del schema, incluidas `ventas`, `venta_pagos`, `turnos_caja`,
`clientes` y `comprobantes`. Hoy no se puede ejercer porque no hay policy
permisiva que lo habilite — o sea, **una sola capa**. Cualquier policy nueva mal
escrita se convierte en escritura anónima sobre plata.

### P2 — Enumeración de negocios

`negocios_select_anon_activo` deja a `anon` listar los 4 negocios activos
(`id`, `nombre`, `slug`, `logo_url`). No tiene restrictive por slug **y no puede
tenerla**: la consulta que la lee (`shared/lib/tenant.ts`) es justamente la que
todavía no sabe qué slug es. Riesgo asumido — el slug ES la URL pública de la
tienda. Si se quiere cerrar, el camino es un RPC `SECURITY DEFINER` que reciba
el slug y devuelva una fila.

### Descartado tras revisar

- **Vistas**: no hay ninguna en `public`. (Una vista sin `security_invoker`
  corre como su dueño y saltea RLS: era el vector obvio a chequear.)
- **Funciones `SECURITY DEFINER` ejecutables por `anon`**: las 16 chequean
  `auth.uid()`, `tiene_permiso()` o `security.current_negocio_id()` —que es
  `NULL` para anon— antes de tocar nada. `crear_negocio_con_owner` y
  `aceptar_invitacion` exigen sesión en la primera línea.
- **`security.negocio_publico()`**: fail-closed correcto. Sin header devuelve
  `NULL`, y `negocio_id = NULL` es `NULL`, así que la restrictive no deja pasar
  nada. Sin slug no hay tienda.

---

## Qué necesita leer el catálogo (política definida)

`20260811140000_rls_anon_catalogo_publico.sql` invierte el default: se revoca
todo a `anon` sobre el schema entero (y se cambian los *default privileges*,
para que la próxima tabla nazca cerrada) y se devuelve `SELECT` **columna por
columna** sólo sobre esto:

| Tabla | Filtro de la policy | Columnas concedidas |
|---|---|---|
| `negocios` | `estado = 'activo'` | `id, nombre, slug, logo_url, estado` |
| `configuracion_pos` | por negocio | branding, contacto, envío (31 de 50) |
| `categorias` | `activa = true` | 9 de 11 |
| `productos` | **`publicado = true`** | 18 de 22 — **sin `precio_costo` ni `id_master`** |
| `producto_variantes` | **`activa = true`** | 9 de 13 — **sin `costo` ni `stock_minimo`** |
| `productos_stock` | por negocio | `id, negocio_id, producto_id, variante, cantidad` |
| `promociones` | **`activa = true`** | 14 de 18 — sin `creado_por`, `limite_usos`, `usos_actuales` |
| `promociones_{productos,categorias,metodos_pago}` | por negocio | sólo ids |
| `metodos_pago` | `activo = true` | 5 de 9 — **sin `comision`** |
| `solicitudes_comercio` | — | **`INSERT` solamente**, sin `SELECT` |

Todas menos `negocios` llevan además la RESTRICTIVE `aislamiento_negocio_publico`
(`negocio_id = security.negocio_publico()`), que es lo que impide que el
catálogo de un negocio vea los datos de otro.

## Confirmación explícita: `anon` NO puede leer

Ninguna de estas tiene GRANT de `SELECT` para `anon`, y todas tienen RLS
encendido — dos capas, no una:

`ventas` · `ventas_items` · `ventas_descuentos` · `venta_pagos` ·
`comprobantes` · `comprobante_numeracion` · `clientes` ·
`cuenta_corriente_movimientos` · `turnos_caja` · `egresos` · `perfiles` ·
`usuarios_negocios` · `roles` · `rol_permisos` · `permisos` · `invitaciones` ·
`planes` · `bajas` · `ordenes_compra` · `ordenes_items` · `diccionario_alias` ·
`importaciones_productos` · `unidades_serie` (IMEI) ·
`actualizaciones_precio` · `actualizaciones_precio_items` ·
`producto_variantes_auditoria` · `atributos` · `atributo_valores` ·
`categoria_atributos` · `producto_variante_valores` · `solicitudes_comercio`.

Las `_backup_*` ya no están en `public`: tres viven en `archivo` (sin `USAGE`
para `anon`) y la de perfiles se dropeó.

Las cinco que el pedido nombraba puntualmente —ventas, clientes, cuentas
corrientes, turnos de caja y costos— quedan cerradas. Los costos en dos
lugares: la columna en `productos`/`producto_variantes`, y la tabla
`producto_variantes_auditoria`, que guarda `costo_anterior`/`costo_nuevo`.

---

## Pendientes que la auditoría destapó (no son de seguridad)

1. **El catálogo público no descuenta reservas.** `store-actions.ts` consulta
   `reservas`, pero `anon` no tiene policy: devuelve cero filas, siempre. El
   `stock_disponible` que ve un visitante ignora las reservas activas. Es
   preexistente. Se dejó el GRANT sobre `reservas` justamente para que siga
   siendo una lista vacía y no un 403 en la tienda en producción.

2. **El carrito público hoy no carga nada en modo path.** `client.ts` saca el
   slug del **host**, así que en `comerz.app/store/evens-indumentaria` no manda
   `x-negocio-slug` y las tres consultas de `cart-panel-publico` (config,
   promociones, recargos) vuelven vacías. Lo arregla el pasaje a subdominio.

3. El schema `archivo` queda con las 3 tablas de broderie (100 filas). Si en
   algún momento se decide que el registro de los duplicados borrados ya no
   hace falta, dropearlas es un `drop schema archivo cascade` — pero eso sí es
   irreversible, y hoy no urge: fuera de `public` ya no las alcanza nadie.
