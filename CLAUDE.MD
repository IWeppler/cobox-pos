# Comerz — Contexto del proyecto

POS + catálogo público, SaaS multi-tenant. Next.js + TypeScript + Supabase.
Deploy: Vercel, branch main.
EN PRODUCCIÓN REAL: en Evens la dueña (Evelyn, admin) y 3 vendedoras (Mara,
Brisa, Zunilda) lo usan a diario. Cualquier cambio que toque ventas/caja/stock
es plata real.

## UNA base, un repo, N negocios

Multi-tenant por `negocio_id` en una sola base Supabase: la que era de Evens
es hoy la base de todo el SaaS (MCP ref `evens-project`). **No hay ninguna
otra base de la app**: si aparece un proyecto Supabase con tablas del POS que
no sea esta, es un resto viejo, no un tenant. Única excepción legítima:
`catalogo_maestro`, que vive aparte y es solo-lectura (ver más abajo).

Negocios vivos: Evens Indumentaria, Estilo Bonito, Ninja Camisetas
(indumentaria) y ClickTostado (electro).

Cómo se resuelve el tenant, sin detección por dominio en el panel:

- Toda tabla del tenant tiene `negocio_id`, con DEFAULT
  `security.current_negocio_id()`. Las policies RESTRICTIVE con
  `security.same_negocio()` son el freno real; pasar `negocio_id` explícito
  en los INSERT es defensa en profundidad, no reemplazo.
- La elección del usuario queda en la cookie `negocio_activo_id` y viaja a
  PostgREST como header `x-negocio-activo` (supabase-js habla con otro
  origen: las cookies no llegan). La cookie NO es credencial —
  `security.current_negocio_id()` valida contra `usuarios_negocios`.
- Pertenencia y rol son POR NEGOCIO (`usuarios_negocios`); `perfiles` es el
  usuario global. En el server: `negocio_actual()` y `rol_actual()`.
- Modo Dios: el super admin de Comerz impersona vía `impersonate_negocio_id`
  / `x-impersonate-negocio`, y la base solo lo honra si
  `security.is_super_admin()`.
- El catálogo público sí se resuelve por subdominio (`negocio-slug.ts`), que
  es otro camino que el del panel.

## Regla de trabajo más importante (aprendida a los golpes)

Un cambio que toca código + schema NO está terminado hasta confirmar las
3 cosas: (1) migración aplicada en Supabase prod, (2) código commiteado,
pusheado Y deploy de Vercel exitoso, (3) smoke test real en producción.
Hubo 3 incidentes por confirmar solo una pata.

Con una sola base la pata (1) es una sola aplicación, pero el precio cambió
de lado: **toda migración impacta a los 4 negocios a la vez**. Un cambio de
schema mal probado ya no rompe un comercio, los rompe a todos. Antes de
aplicar, pensar qué pasa con el negocio que tiene 994 productos y con el que
tiene 11.

## Arquitectura y decisiones clave

- `producto_variantes` es la fuente canónica (atributos JSONB + relación
  producto_variante_valores). `productos_stock` es espejo legacy: se
  mantiene sincronizado en cada escritura, NUNCA se normaliza su texto.
- Stock se descuenta con UPDATE atómico condicional vía RPC
  `ajustar_stock_variante` (por variante_id, nunca por nombre).
- La venta se ESCRIBE en una transacción: cabecera + pagos + renglones +
  descuento + deuda de CC + espejo legacy de stock + reservas van juntos en la
  RPC `registrar_venta` (`20260816120000`). Antes eran seis escrituras sueltas
  y el insert de pagos devolvía error SIN revertir nada: quedaba una venta
  CONFIRMADA sin un solo pago, con el stock ya descontado. El de `ventas_items`
  ni se chequeaba. Quedan AFUERA a propósito el descuento de stock y las
  unidades serializadas: ya son atómicos y fallan por otro motivo (no hay
  mercadería, que es una respuesta al usuario, no una rotura). Si la RPC falla,
  create-sale revierte esos dos y no queda ningún punto intermedio.
  SECURITY INVOKER, no DEFINER: el aislamiento tiene que seguir siendo la RLS
  del que llama. Verificado que un usuario apuntando a un negocio ajeno no
  escribe nada.
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
- Egresos, dos ejes que no son el mismo: `egresos.tipo` (OPERATIVO |
  RETIRO_SOCIO | COMPRA_MERCADERIA, CHECK fail-closed, default OPERATIVO).
  Los TRES sacan plata del cajón — el arqueo de cierre sigue restando todo
  (`calcular_egresos_turno` no filtra por tipo) — pero solo OPERATIVO resta
  de la ganancia: un retiro es la ganancia ya hecha y una compra ya viene
  contada en `precio_costo` de lo vendido (restarla era contarla dos veces).
  El criterio vive en `features/caja/lib/tipo-egreso.ts` y lo comparten el
  modal, la action y `get-dashboard-metrics`. `orden_compra_id` linkea el
  pago al remito, con CHECK de que solo COMPRA_MERCADERIA puede tenerlo y
  ON DELETE SET NULL (borrar el remito no puede borrar el egreso: la plata
  salió igual y el arqueo tiene que seguir cerrando).
- /caja son 3 vistas separadas por PREGUNTA, no por origen del dato: Hoy (el
  turno propio arriba, si opera caja, y abajo el resumen del día: mismo tema
  con dos niveles de zoom) / Dinero / Historial. El período de calendario
  (`shared/lib/periodo-ranges.ts` + `shared/components/periodo-selector.tsx`,
  movidos ahí desde features/dashboard cuando pasaron a tener dos consumidores)
  gobierna SOLO lo acreditado; el efectivo y lo pendiente son fotos de ahora y
  lo dicen en el título. El rango lo resuelve la BASE (`p_periodo`), no el
  cliente: mismo motivo que `p_fecha` en el resumen gerencial.
- Posición de dinero (`posicion_dinero`, gateada por `caja.ver_gerencial`):
  responde "dónde está la plata" y es DERIVADA de turnos/venta_pagos/egresos —
  NO es el saldo del banco (la cuenta se mueve por cosas que el POS no ve).
  Tres bloques que a propósito no se suman en un total: efectivo de turnos
  ABIERTOS (misma fórmula que el cierre; no se lee `turnos_caja.
  efectivo_esperado`, que en un turno abierto quedó congelado en el monto
  inicial), cobrado sin acreditar (`creado_en + acreditacion_dias > now()`,
  las tarjetas a 20 días) y acreditado en el período. Mezclar plata
  disponible con plata futura en un solo número es justo el error que hace
  gastar lo que todavía no entró.
- Rubro: flag `configuracion_pos.rubro` ('indumentaria' | 'electro', CHECK
  fail-closed, default indumentaria). Cambia la identidad del producto en la
  UI, no el schema: indumentaria muestra "N var.", electro muestra Modelo +
  EAN (`features/stock/lib/identidad-por-rubro.ts`). El EAN vive en
  `producto_variantes.sku` — misma columna, otro label.
- Catálogo Maestro (`catalogo_maestro`): tabla de fichas de electro que vive
  en OTRO proyecto Supabase (`CATALOGO_MAESTRO_SUPABASE_URL`, cliente aparte
  en `shared/config/supabase/catalogo-maestro.ts`) — la ÚNICA base fuera de
  la del SaaS, y a propósito: es un padrón compartido por todos los negocios,
  no datos de un tenant. Solo-lectura por RLS (no hay política de
  INSERT/UPDATE/DELETE: anon y authenticated no escriben ni por error) y no
  recibe migraciones desde este repo.
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
  tablas; las 88 políticas vivas nunca habían estado en git). Con
  multi-tenant la base tiene 44 tablas y 144 políticas: cada tabla nueva
  necesita su policy de negocio, no alcanza con la columna.
  **Cómo se escribe la policy importa tanto como qué dice**: va
  `negocio_id = (select security.current_negocio_id())`, NUNCA
  `security.same_negocio(negocio_id)`. Dan el mismo resultado fila por fila,
  pero la segunda recibe la columna como argumento, así que Postgres la ejecuta
  UNA VEZ POR FILA y el predicado queda como `Filter` en vez de `Index Cond`
  — o sea que el índice de negocio_id ni se usa. Medido con un usuario real
  sobre producto_variantes: 132 ms contra 4 ms. Era la causa de que los
  listados de productos promediaran entre 663 y 2.372 ms y de que
  producto_variantes acumulara 14.700 millones de filas leídas sobre una tabla
  de 4.951. Corregido en `20260816100000`, que además deja un guard: la
  migración falla si queda alguna policy con la forma vieja.
  `same_negocio()` sigue existiendo para las migraciones que ya la usan, con
  un COMMENT que avisa que no va adentro de una policy.
- Índices: toda tabla del camino de la venta necesita índice por sus FK, no
  solo por `negocio_id` (`20260816110000`). Antes, `venta_pagos` leía 92
  millones de filas sobre una tabla de 623 para armar los tickets y el arqueo.
  Los compuestos arrancan por `negocio_id` porque, con la RLS ya resuelta por
  statement, ese es el primer filtro de toda consulta.
  OJO con `producto_variantes.sku`: tiene índice pero NO es único, y no puede
  serlo — en electro guarda el EAN de la unidad y en indumentaria el código del
  MODELO, que todos los talles comparten (Estilo Bonito tiene hasta 9 variantes
  con el mismo). Son dos semánticas en una columna; separarlas es otro cambio.
- Ingreso de mercadería: UN solo camino, "Ingresar mercadería"
  (`ingresar-mercaderia-modal.tsx`), igual para todos los rubros. Adentro se
  elige el ORIGEN del archivo —planilla del proveedor o planilla propia— y las
  dos terminan en la MISMA conciliación (/compras/merge). Antes eran dos
  botones distintos elegidos por el rubro, y esa era la lectura equivocada: la
  diferencia nunca fue el rubro sino quién escribió el archivo. Una tienda de
  ropa también tiene planillas propias y una de electro también recibe
  remitos.
  Por qué la planilla propia TAMBIÉN se concilia (antes escribía derecho):
  con 300 productos cargados nadie se acuerda si "Remera blanca talle M Levis"
  ya existe o si la cargó escrita distinto, y esa pregunta sin responder es la
  que produce el catálogo duplicado. Quién escribió el archivo no la cambia.
  Como consecuencia hay UN solo motor de escritura de stock por ingreso
  (`aprobar_orden_compra`), que ahora también crea las unidades de
  `unidades_serie` cuando la línea trae IMEI.
  El guard contra subir dos veces el mismo archivo es
  `ordenes_compra.hash_planilla` (unique parcial por negocio, null en los
  remitos de proveedor): la conciliación ya protegía contra aprobar dos veces
  la misma orden, pero no contra crear dos órdenes desde el mismo archivo.
- Lo que cambia por RUBRO son las COLUMNAS de la plantilla, no el flujo
  (`features/stock/lib/columnas-por-rubro.ts`). Las columnas base —categoría,
  producto, stock, costo, venta— son iguales en todos: es lo que hace a un
  producto vendible y no depende de qué se vende. Lo específico se AGREGA y
  nunca reemplaza, así una planilla de un rubro entra en otro perdiendo lo que
  no aplica en vez de fallar entera. Cada columna declara si parte variantes
  (talle, color, medida, material, peso, presentación sí; marca y modelo no),
  y eso es lo que le permite a la conciliación agrupar filas del mismo
  producto. El parser reconoce TODAS las columnas de TODOS los rubros a
  propósito: una planilla armada con otra plantilla tiene que entrar igual.
  Indumentaria NO lleva `codigo_barras`: la ropa de proveedor local rara vez
  lo trae y una columna siempre vacía enseña a ignorar columnas.
  NO existen `vencimiento` ni `lote` aunque alimentos y farmacia los
  necesiten: el vencimiento es del LOTE, y esa tabla no existe todavía.
  Ofrecer la columna y tirar el dato al importar es peor que no ofrecerla.
- Los 7 rubros del tipo `Rubro` ahora son los 7 del CHECK. Hasta
  `20260815100000` el CHECK aceptaba solo indumentaria y electro, y
  `normalizarRubro` era `valor === "electro" ? ... : "indumentaria"`, o sea
  que los otros cinco se leían como indumentaria aunque estuvieran bien
  guardados. Inofensivo antes; con plantilla por rubro le daba a una
  ferretería las columnas de una tienda de ropa.
- Importación de planilla DIRECTA (`importar_productos_planilla` y su UI):
  quedó SIN punto de entrada al unificar el ingreso, pero no se borró todavía
  — el flujo nuevo tiene que probarse con planillas reales antes de tirar el
  que funcionaba. Lo que sigue describe ese camino, hoy inactivo.
  TODA la escritura corre en la RPC
  `importar_productos_planilla` (productos + variantes + relaciones de
  atributos + IMEI + stock + espejo legacy), en una transacción y en batch —
  antes era un `for` con await adentro, ~10.000 round-trips con el tope de
  3000 filas. Cada fila es atómica (bloque BEGIN/EXCEPTION = savepoint): una
  fila que falla no deja producto sin variante ni IMEI sin stock, y las demás
  siguen. La canonicalización de atributos se queda en Node, igual que en
  `aprobar_orden_compra`. Idempotencia: `importaciones_productos` con unique
  PARCIAL `(negocio_id, hash) where not forzada`; el INSERT del guard va
  PRIMERO (toma el row lock que serializa dos importaciones simultáneas) y
  "ya se importó" vuelve como `{ya_importada: true}`, no como excepción. El
  hash es sha256 del CONTENIDO parseado (`hash-import-productos.ts`), no de
  los bytes: la misma planilla en CSV y en XLSX es el mismo import, y
  cambiar una cantidad la vuelve otra. Reimportar a propósito existe y es
  explícito (`p_forzar`, que marca la fila `forzada` y esquiva el unique).
  El plan va FIRMADO (`firma-plan-import.ts`): la preview devuelve una firma
  del plan (acción + destino + categoría + unidades + si la fila está
  bloqueada, por fila; los avisos quedan afuera porque no cambian lo que se
  escribe) y confirmar recalcula el plan contra el catálogo de ESE momento y
  compara. Si no coincide no escribe nada y devuelve el plan nuevo con las
  filas que cambiaron. Falta de firma = desactualizada (fail-closed).
  La preview (`import-preview.tsx` + `filtrar-plan-import.ts`) es filtrable
  por contadores y corrige el precio de venta inline: la corrección NO
  parchea el plan en el cliente, cambia las filas y vuelve a pedir la preview
  (debounce) — plan y firma tienen que salir siempre del mismo lado. Las dos
  actions chequean `tiene_permiso('stock.importar_planilla')`: el botón
  escondido no es control de acceso, un server action es un endpoint. El
  permiso se otorgó a los roles que ya tenían `stock.ingresar_remito` (son
  los dos flujos hermanos por rubro) y los negocios nuevos lo reciben solos
  porque `crear_negocio_con_owner` le da al ADMIN todas las filas de
  `permisos`.
- Facturación, dos ejes que no son el mismo: `modo_facturacion` es la
  CAPACIDAD (INTERNO | MANUAL | ARCA — solo ARCA emite con CAE; MANUAL factura
  fuera de Comerz y para el POS se comporta como INTERNO) y
  `comprobante_defecto` es la ELECCIÓN. El criterio vive en
  `shared/lib/facturacion.ts` y lo comparten el panel, la action y —para la
  regla de modo— un CHECK. Ese CHECK cruza las dos columnas, así que el UPDATE
  las manda SIEMPRE juntas: pasar de ARCA a INTERNO con 'FACTURA_B' guardado
  es violación de CHECK aunque el usuario solo haya tocado el modo. La regla
  de que la letra corresponda a la condición de IVA del emisor (un
  monotributista no emite A ni B) NO es CHECK a propósito: como CHECK
  impediría guardar el cambio de Monotributo a RI mientras arrastra un default
  viejo. La condición se lee de la BASE, nunca del form.
- `comprobantes`: qué papel salió por cada venta, tabla aparte y no columnas en
  `ventas` porque una venta puede tener MÁS de un comprobante (anular una
  factura no es editarla: es emitir una nota de crédito, con su propio CAE y su
  propio número) y porque un comprobante es INMUTABLE y una venta no. La
  inmutabilidad es RLS: no hay policy de UPDATE ni de DELETE, así que la base
  las deniega — mismo criterio que el turno de caja cerrado. Los datos del
  receptor y los importes van CONGELADOS en la fila (igual que el recargo en
  `venta_pagos`): si mañana la clienta corrige su CUIT, la factura ya emitida
  tiene que seguir diciendo lo que decía, y leerlos por join contra `clientes`
  los haría cambiar solos. `siguiente_numero_comprobante` serializa por row
  lock (un solo `insert ... on conflict do update ... returning`) para que el
  número no salga nunca de un `select max(numero) + 1`, y es autoridad SOLO
  para TICKET: en los fiscales el último número autorizado lo dice ARCA
  (FECompUltimoAutorizado), no esta base.
- Exportaciones para el contador (pestaña en /reportes), NO "Contabilidad":
  Comerz no lleva la contabilidad, prepara la información para que la lleve el
  contador. El catálogo (`features/exportaciones/lib/catalogo-exportaciones.ts`)
  declara por exportación si tiene fuente de datos REAL hoy, y el motivo cuando
  no. Los libros de IVA están deshabilitados a propósito: uno armado con
  tickets internos como si fueran facturas es información falsa firmada por el
  comercio. El de COMPRAS no se destraba con ARCA — `ordenes_compra` no guarda
  CUIT, tipo de comprobante ni IVA: son remitos, no facturas de compra.
  El período tiene su propio selector (`periodo-exportacion.ts`) y NO reusa
  `resolverRangoAnterior("mes")` de shared: esa recorta al mismo día del mes
  para que el panel compare mes-a-la-fecha, así que un contador que pide julio
  un 8 de agosto se llevaría del 1 al 8 y presentaría un mes incompleto.
  En las planillas los importes van como NÚMERO (un contador filtra y suma;
  "$1.234" como texto convierte la planilla en un dibujo) y las fechas como ISO
  (Excel lee 03/04 como marzo o abril según la máquina de quien abre). Las
  ventas anuladas aparecen marcadas: sacarlas deja huecos sin explicación.
- QUÉ comprobante corresponde lo decide UNA función en el server:
  `shared/lib/determinar-comprobante.ts`. Cruza cuatro datos —condición de IVA
  del EMISOR, del RECEPTOR, tipo de operación (venta/devolución) y config del
  comercio— y por eso es módulo propio y no ifs repartidos. Es pura y sin IO:
  recibe los cuatro datos resueltos, así la matriz entera se testea sin base.
  El POS manda la venta, NUNCA el tipo de comprobante: uno elegido en el
  navegador es uno que se elige con las DevTools abiertas.
  La matriz: monotributista o exento emiten SIEMPRE C (no discriminan IVA
  porque no lo liquidan); un RI emite A solo a otro RI —que es el único que
  computa crédito fiscal— y B a todo el resto, incluido el receptor sin datos.
  La celda RI → Monotributo está aislada en la constante `RI_A_MONOTRIBUTO`
  (hoy en B, por el mismo criterio del crédito fiscal): es la única donde el
  criterio y la costumbre pueden discrepar, y **hay que confirmarla con el
  contador** antes de facturar.
  `comprobante_defecto` es una PREFERENCIA, no una orden: si la matriz no lo
  habilita para ese receptor, gana la matriz. Un comercio con "Factura A" por
  defecto que le vende a consumidor final emite B.
  `determinarComprobanteFiscal` es la matriz sin el corte por
  `ARCA_EMISION_DISPONIBLE`, y existe para poder testearla HOY con el flag
  apagado — si la única puerta incluyera el corte, la regla quedaría sin una
  sola prueba hasta el día en que ya no se puede descubrir que estaba mal.
- Emisión del comprobante: paso 11 de create-sale.ts, vía
  `features/sales/lib/emitir-comprobante.ts`. Es el ÚNICO paso de la venta que
  NO puede voltearla: cuando corre, la plata ya se cobró y el stock ya se
  descontó, y no hay transacción que abarque las dos cosas. Con TICKET interno
  dejar la venta sin comprobante es menos malo que hacer rebotar una venta que
  ya pasó en el mostrador, así que la función devuelve resultado y NUNCA lanza
  — pero loguea `[COMPROBANTE]` como error, porque una venta sin comprobante
  es un hueco contable que hay que poder encontrar. **Con ARCA esto se
  invierte**: una factura no se entrega sin CAE, así que el CAE hay que
  pedirlo ANTES de cerrar la venta.
  Qué se emite lo decide `tipoComprobanteAEmitir`, no `comprobante_defecto`:
  mientras `ARCA_EMISION_DISPONIBLE` sea false sale TICKET aunque la config
  diga Factura B, porque una fila FACTURA_B sin CAE es un comprobante inválido
  guardado como válido. La base lo respalda: CHECK de que TICKET nunca lleva
  CAE y todo lo fiscal siempre lo lleva. Prender ARCA es cambiar esa constante
  en UN lugar.
  Ojo con la FK `comprobantes.venta_id ON DELETE RESTRICT`: la policy
  `ventas_delete_propia_o_admin` existe y ahora una venta con comprobante ya
  no se puede borrar. Es lo buscado (la app nunca borra ventas: anula con
  `estado_operacion`), pero es un camino que antes funcionaba.
- El número que se imprime es el del comprobante (`formatearNumeroComprobante`,
  "0001-00000123"), no más el prefijo del UUID de la venta. En el POS viaja en
  la respuesta de `registrarVentaAction` (sin consulta extra); en el historial
  entra por embed en `getVentasAction`. Las dos puntas caen al prefijo del UUID
  si no hay comprobante — ventas anteriores a la tabla, o emisiones fallidas —
  así que ningún ticket queda sin número que decirle al cliente.
- Tratamiento de IVA del producto: UN campo (`productos.tratamiento_iva`:
  GRAVADO_21 | GRAVADO_105 | GRAVADO_27 | EXENTO | NO_GRAVADO), no dos. Con
  "alícuota" y "exento/gravado" separados existen combinaciones imposibles
  —exento con 21%, gravado sin alícuota— y alguien las guarda. EXENTO y
  NO_GRAVADO se distinguen aunque los dos den cero: van en columnas distintas
  del libro de IVA. El criterio vive en `shared/lib/fiscal-producto.ts` con el
  desglose (`desglosarIva`), y OJO con la dirección de esa cuenta: el neto es
  `precio / (1 + alícuota/100)`, NO `precio - precio * alícuota/100` — con 21%
  la segunda da 79 en vez de 82,64 sobre 100.
  `unidad_medida` guarda la unidad SEMÁNTICA, no el código numérico de ARCA: la
  traducción entra con la integración, donde se puede verificar contra la tabla
  oficial. Los defaults salen del rubro (`defaultsFiscalesPorRubro`) y se COPIAN
  al producto en el alta: son punto de partida, no regla viva — cambiar el rubro
  del comercio NO recalcula lo ya cargado.
  El bloque fiscal del formulario va COLAPSADO y, cerrado, no monta sus inputs;
  las actions miran `formData.has(...)`. Es lo que evita que corregir un precio
  le devuelva al 21% un producto que estaba al 10,5% — mismo patrón que el
  toggle fiscal del cliente.
- Cliente comercial y cliente fiscal son el MISMO cliente con dos niveles de
  datos, no dos entidades: lo fiscal (razón social, CUIT, condición IVA,
  domicilio fiscal) es opcional y se revela con el toggle `es_fiscal`. Apagar
  el toggle BORRA los datos fiscales, y es a propósito — por eso el modal de
  edición siembra el switch desde `cliente.cuit` durante el render (no en un
  useEffect): si arrancara apagado, guardar sin tocarlo le borraría al cliente
  todos sus datos fiscales sin avisar. `direccion_comercial` (contacto/entrega)
  es OTRA columna que `direccion` (domicilio fiscal, el que va en la factura):
  antes solo existía la fiscal, así que un cliente sin CUIT no podía tener
  dirección ni para mandarle mercadería.
  El CUIT se valida por dígito verificador (`shared/lib/cuit.ts`, módulo 11) en
  el form y otra vez en la action, y se guarda normalizado a 11 dígitos para
  que "30-712..." y "30712..." no entren como dos clientes. Es la mitad del
  autocompletado de ARCA que se puede tener sin certificado: no dice quién es
  el titular, pero atrapa el dígito mal tipeado en el mostrador y no dos días
  después. `(negocio_id, cuit)` y `(negocio_id, dni)` son únicos con índice
  PARCIAL (la mayoría no tiene ninguno de los dos, y el filtro cubre tanto NULL
  como cadena vacía); son por negocio porque dos comercios comparten clientes.
  Hasta que se agregaron, el `if (error.code === "23505")` de crearCliente era
  código muerto y los duplicados entraban sin chistar.
- Anular una venta CON FACTURA está frenado (`requiereNotaCredito` en
  cancel-sale.ts): una factura no se anula marcando la venta, se compensa con
  una nota de crédito, que necesita su CAE y por lo tanto ARCA. Dejar pasar la
  anulación dejaría una factura viva en ARCA contra una venta que el sistema
  da por anulada. Con TICKET interno NUNCA se activa, así que hoy anular
  funciona igual que siempre; es la red para el día que se prenda ARCA.

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
- **Un cambio no está terminado hasta las 3 patas** (migración aplicada +
  push con deploy verde + smoke test real). Regla arriba del todo.
- **Lo que se aplica a mano y no queda como migración, se pierde.** Era el
  drift entre bases; con una sola base sigue valiendo igual, porque el repo
  tiene que poder reconstruir el schema desde cero.
- **Una migración ahora toca a todos los negocios.** El modelo por-proyecto
  daba, sin querer, un release gradual: se aplicaba en uno y se miraba. Eso
  ya no existe — lo reemplaza probar bien antes, y preferir cambios
  aditivos y reversibles.
- **El aislamiento entre negocios es RLS, no el código.** Filtrar por
  `negocio_id` en la query es defensa en profundidad; si una tabla nueva
  queda sin policy RESTRICTIVE, un negocio ve los datos de otro.

## Estado al 8/8/2026 (viernes)

La decisión de arquitectura SaaS ya se tomó y está ejecutada: multi-tenant
por `negocio_id` en una sola base. Los 4 negocios corren ahí, con
`usuarios_negocios`, negocio activo por header, super admin con modo dios y
planes por negocio.

Hecho y en producción:

- Idempotencia de aprobación de remitos (guard + `ya_aprobada` consumido por
  merge-purchase.ts / merge-table.tsx).
- Baseline de RLS versionado, `thumbnail_url`, `rubro` + `modelo`,
  `id_master`.
- Catálogo Maestro + búsqueda por texto; Carga Rápida con picker de maestro,
  prefill y quick-create.
- Merge de remitos: sugerencias de match y de categoría, umbral y audiencia,
  clasificación de match (T1/T2/T3). Gotcha visto en datos reales:
  `estado_match` guardado puede quedar stale.
- Categorías en árbol (Evens ya no es catálogo plano; REGLAS_CATEGORIA quedó
  obsoleto y silencioso).
- Seed de métodos de pago default; CC + método de pago; historial de
  movimientos por producto (`features/stock/ui/movimientos-table.tsx`).

En curso (código sin pushear al 8/8):

- Panel: selector de período único (Hoy/Semana/Mes/Año) que gobierna también
  el gráfico, con comparación contra el período anterior equivalente; gráfico
  mobile sin eje Y y con tooltip táctil; header sin duplicar el comercio
  activo (el logo ES el switcher); dropdowns con blanco táctil de 44px en
  mobile.
- Ingreso de mercadería separado por rubro y RPC
  `importar_productos_planilla` (esta SÍ está aplicada en la base).
- Base fiscal previa a ARCA: `configuracion_pos.modo_facturacion` /
  `comprobante_defecto` / `punto_venta`, tabla `comprobantes` +
  `comprobante_numeracion` y permiso `configuracion.facturacion` (las DOS
  migraciones SÍ están aplicadas; los 4 negocios quedaron en INTERNO/TICKET,
  o sea sin cambio de comportamiento). El TicketPanel pasó de maqueta a
  guardar de verdad: su submit era un `setTimeout` con toast de éxito. Se
  sacó el wizard de CSR, que "generaba" un CSR de texto fijo y avisaba
  "certificado .p12 guardado en el servidor" sin subir nada.

- Emisión conectada de punta a punta: create-sale.ts escribe en `comprobantes`
  (paso 11), el número emitido se imprime en el ticket y en el historial, y la
  anulación tiene el freno de nota de crédito. Los 4 negocios emiten TICKET
  interno, que es lo que necesitan hoy; el terreno queda listo para facturar.

- Exportaciones (Excel) de Ventas, Comprobantes, Compras, Movimientos de caja
  y Movimientos generales. Libros de IVA y notas de crédito/débito listados
  pero deshabilitados, cada uno explicando qué le falta.
- Determinación centralizada del comprobante (`determinar-comprobante.ts`,
  27 tests sobre la matriz real). Se eliminó `tipoComprobanteAEmitir`, que
  miraba solo la config y nunca al cliente: dos funciones que responden la
  misma pregunta con distinta información terminan en dos respuestas distintas.
- Productos: `tratamiento_iva`, `unidad_medida` y `genero`, con defaults por
  rubro y bloque fiscal colapsado. Los 1.606 productos existentes quedaron en
  21% + Unidad, que es lo correcto para los 4 negocios. Falta el desglose de
  IVA en el comprobante: `comprobantes` tiene UN neto y UN iva_monto, y una
  factura con líneas al 21% y al 10,5% necesita subtotales POR alícuota — eso
  es una tabla hija y entra con ARCA.
- Clientes: dirección para el no-fiscal, validación de CUIT por dígito
  verificador y unicidad de CUIT/DNI por negocio. El autocompletado del
  padrón (tipear CUIT → traer razón social y condición) NO se puede hacer
  todavía: los web services de padrón de ARCA piden WSAA con el MISMO
  certificado X.509 que la facturación, así que está bloqueado por lo mismo.
  Se sacó el botón "Buscar en ARCA", que era un setTimeout con un toast.

Lo único que falta para facturar de verdad es la conexión con ARCA: generar el
CSR, cargar el certificado y pedir el CAE. Cuando se haga hay que revisar DOS
decisiones que hoy están tomadas para el mundo sin ARCA: el comprobante se
emite DESPUÉS de cerrar la venta (con factura el CAE va antes) y la anulación
frena en vez de emitir la nota de crédito. Ojo: lo vendido ANTES de esto no es
recuperable hacia atrás — solo hay datos fiscales desde que el POS empezó a
escribir la tabla.

Próximo en el importador de planilla, por orden de riesgo: idempotencia por
hash del archivo (hoy reimportar suma stock de nuevo), plan firmado (el plan
que se aprueba en la preview se recalcula al confirmar y puede haber
cambiado), y preview filtrable con corrección inline.
