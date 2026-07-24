ideas:
- codigo de barras / sku - que diferencias son?
- atajos con teclado
- Tiene que venir preestablecido los metodos de pago: transferencia, efectivo, Mercado Pago
- que opinas de tener una segunda venta en simultaneo?
- CLIENTES: Razon social/Nombre, CUIT, Condicion IVA:
- Login con huella: Entrás con tu huella o Face ID en vez de escribir la contraseña cada vez.
- Multi-sucursal: Hasta 10 sucursales bajo la misma cuenta, con stock y caja independientes.
- Exportación contable: Resumen de IVA, libro de ventas y compras, caja X y Z: un Excel listo para tu contador.
- conectar mercado pago para que te aparezca el qr y que te avise que se pago. entiendo que no sirve si tenes varias vendedoras en un local.
- creacion de producto al vuelo desde el pos para que puedan empezar a vender desde el primer dia
- Datos de la empresa: nombre comercial +/ razon social, cuit. etiquetas de codigo de barra: a4, 50x30, 40x25, modo de facturacion: AFIP Manual (generar cuando se necesite), AFIP Automatico, Ticket Interno (Sin Afip)
- Alicuota IVA (creacion de productos): 21% general; 10,5% alimentos básicos, carne, panificados, harinas; 0% exento. 



# TIER 0 — Cerrar lo abierto (esta semana, antes de cualquier feature nueva)
- Caja #9: endurecer RLS de SELECT en turnos_caja — 1 hora, seguridad, pendiente hace rato.

# TIER 1 — Plata correcta y operación diaria (2-4 semanas)


## Catálogo/stock:

1.  Modo de carga rápida por SKU (escribo código→enter→sigue enfocado) — misma familia que barcode, diseñalos juntos: es la versión teclado del mismo flujo.

## Ventas:

1.  Lectura de código de barras — ahora que SKU existe en el pipeline (remito→variante), es el momento natural; para indumentaria con caja rápida es el salto de agilidad más grande disponible.

## Caja:

1.  Retiros de dueño como movimiento separado.
2.  Tabla admin "cuánto tengo en cada caja/banco/MP" (alto valor para dueñas, y es agregación de datos que ya tenés).
3.  Marcar esperado-negativo como revisado.
4.  Compras ≠ gastos.

## Clientes:

1.  Chequeo de duplicados en import CSV (re-subir hoy duplica clientes = riesgo de datos real).
2.  🤖 ver Tier 3 (portal de deuda).


# TIER 2 — Decisión de arquitectura SaaS (antes del tercer cliente, no después)

1. Multi-tenant (negocio_id) vs. provisioning por proyecto: decidilo YA, con lo aprendido. El segundo comercio te mostró el costo real del modelo por-proyecto: drift infinito, cada categoría de schema (policies, constraints, columnas) rompiéndose por separado. Mi recomendación: el refactor a negocio_id es grande pero se hace UNA vez; el drift lo pagás por cliente por siempre. Con 2 clientes es el momento más barato de tu vida para hacerlo. Si decidís quedarte con por-proyecto igual, entonces la automatización del provisioning (runbook + script + diff de esquema) deja de ser opcional y pasa a ser producto interno de primera clase.

2. Landing page + blog/tutoriales — en paralelo (no depende de código del POS), es lo que te permite vender mientras construís.

3. Separación de módulos/planes ($30k/$50k/$70k) — requiere gating por plan; diseñarlo junto con la decisión multi-tenant porque el "qué plan tiene este negocio" vive en la misma capa que negocio_id.
   IVA: dropdown de impuesto en producto (creación/edición/CSV) — es el prerrequisito chico de la facturación ARCA de Fase 5; hacelo antes y la integración fiscal después se apoya en datos ya cargados.

# TIER 3 — Diferenciadores con IA (después de Tier 2, porque venden el SaaS)

🤖 Asistente de Orden de Compra — el mejor candidato de toda tu lista: "qué comprar y cuánto" en base a ventas del período + stock mínimo + stock actual. El 80% es cálculo determinístico (que es lo que lo hace confiable); la capa IA es el resumen en lenguaje natural ("se viene el invierno y las camperas rotaron 3x más que el mes pasado"). Es demo perfecta para vender el SaaS.

🤖 Advisor banner de Reportes con inteligencia real — hoy existe pero es tonto; conectarlo a un LLM que lea los agregados del período y sugiera acciones concretas. Mismo motor conceptual que el asistente de compra — diseñalos como una sola capa de "insights" con dos salidas.

🤖 Portal de deuda para el cliente final (link donde el cliente ve su deuda y la paga) — enorme para el rubro fiado/cuenta corriente del interior; empezá read-only (link firmado con la deuda y el desglose, cero login) y el pago con MP como fase 2. Conecta con el recargo por mora que ya construiste.

🤖 Carga de stock por voz/texto — ya tenés la mitad construida sin darte cuenta: el parser de remitos + diccionario_alias ES el motor de interpretación; voz/texto libre es otra entrada al mismo pipeline. Por eso va después del asistente de compra: comparte piezas y para entonces el pipeline está más maduro.

🤖 Agente WhatsApp — al final de esta serie: es la interfaz más vistosa pero depende de que todo lo anterior exista (consultar deuda → portal; cargar stock → pipeline de interpretación; avisos → datos de reportes).
Promociones conectadas a Reportes — antes del advisor inteligente idealmente, porque le da más señales que leer.

# TIER 4 — Expansión de mercado (cuando el SaaS ya factura)

1. Facturación electrónica ARCA (con el IVA de Tier 2 ya cargado).

2. Impresión térmica ESC/POS — suele ser condición de adopción para quioscos/carnicerías; para indumentaria fue esquivable, para el mercado amplio no.

3. Presupuestos y estados de venta (Cobrado/Presupuesto/A Confirmar).

4. Seeds por industria (quiosco, ferretería, carnicería...) + venta por peso — van juntos: venta por peso es el prerrequisito técnico de carnicería/verdulería, y los seeds son lo que hace que el onboarding self-service del SaaS no arranque en blanco.
<!-- "Tu arquitectura ya está bastante bien parada para esto sin saberlo: producto_variantes.atributos es JSONB libre — "Talle"/"Color" no están hardcodeados en el schema, son solo los valores que Evens usó. Un quiosco puede simplemente no usar atributos (cada producto es su propia variante única), y categoria_atributos (la tabla que encontraste "de fachada") es exactamente la pieza pensada para declarar qué atributos aplican por categoría/rubro — hoy sin terminar, pero es la dirección correcta para los seeds por industria que ya tenías en el backlog.

Quiosco — el más fácil de los tres. Productos de SKU único (sin talle/color), altísimo volumen de tickets chicos. Lo que más necesita ya está en tu Tier 1: código de barras + carga rápida por SKU. Fiado también es común en quioscos de barrio, así que tu módulo de clientes/cuenta corriente aplica igual. Prácticamente sin desarrollo nuevo, es configuración.

Herboristería — fácil-medio. Mezcla de productos por unidad (empaquetados, con código de barras) y a granel (hierbas sueltas por peso/cucharada). La parte por unidad no pide nada nuevo; la parte a granel necesita lo mismo que carnicería, aunque menos central al negocio.

Carnicería — la que sí exige una feature nueva de verdad: venta por peso. Hoy tu sistema asume cantidad entera (1, 2, 3 unidades). Vender por kg necesita cantidad decimal de punta a punta: línea de venta, descuento de stock, cálculo de precio, reportes — no es un flag, es tocar el camino completo de la venta. La integración con balanza (Bluetooth/USB) es la versión "de lujo" — con carga manual del peso por teclado ya funciona sin hardware. Es la única de las tres que no podés resolver por configuración; es la que corresponde planificar como feature real, tal como ya la tenías anotada." -->

5. Categorías y subcategorías reales (parent_id + categoria_atributos funcionando de verdad) — encaja acá porque los seeds por industria lo necesitan; mientras tanto el campo queda oculto como ya definimos.

<!-- - Emprendedor ($30k): caja + ventas + stock + catálogo público básico. Sin cuenta corriente (o con tope chico de clientes), sin reportes avanzados, sin multi-caja.
- Gestión ($50k): + cuenta corriente/fiado completo (tu diferencial más fuerte para el interior, casi nadie gastronómico lo tiene bien resuelto), + reportes, + multi-caja/roles.
- Empresa ($70k): + multi-sucursal, + facturación fiscal (cuando esté ARCA), + integraciones (impresora térmica, código de barras avanzado). -->

6. Multi-sucursal — y es un vacío real que tu propio pricing ya asumía sin que el roadmap lo dijera. Repasá tu Plan Empresa ($70k): lo llamaste "Empresa / Multi-sucursal" — ya le estás cobrando algo que no existe en ningún lado del roadmap de features. Hay que diseñarlo, y hacerlo distinto y explícito de la decisión de multi-tenant que ya veníamos discutiendo: multi-sucursal es un negocio con varias ubicaciones físicas (mismo dueño, catálogo y clientes compartidos, stock separado por depósito) — es un sucursal_id anidado bajo tu futuro negocio_id, no lo mismo que "muchos negocios distintos en una base". Diseñalos juntos porque son la misma conversación de arquitectura, pero son conceptualmente dos cosas.

7. Integración Tiendanube (y quizás MercadoLibre después) — Dux lo tiene, es un dolor real para comercios argentinos que ya venden en ambos canales sin sincronía de stock (venden el mismo producto dos veces). Tenés razón en que esto no es un feature aislado, es un cluster: necesitás (a) el módulo de órdenes con estados que ya tenías anotado para presupuestos, reusado para pedidos de e-commerce; (b) reportes por canal de venta (mostrador vs. Tiendanube); (c) el flujo de venta con envío, que resucita tu "envío por localidad" pausado — se vuelve prerequisito, no nice-to-have. Es grande; va después de la decisión de multi-tenant, no antes.

# Caja / Multicaja

- Atribuir devoluciones al turno original de la venta (si sigue abierto), no al turno de quien ejecuta la anulación — ya diseñado, falta implementar
- Retiros de dueño como tipo de movimiento separado de gastos operativos
- Marcar un "esperado negativo" como revisado/explicado (sin borrar el historial)
- Agrupar historial por día + filtro por rango de fechas
- Resumen diario consolidado (todos los turnos de un día en una vista)
- Rediseño de /caja: turno propio vs. historial según estado del usuario, filtros en "Movimientos del - Turno" (egresos/ingresos/método de pago)
- Cuenta corriente + método de pago real (arriba)
- Conciliación de cobros digitales contra el resumen real del banco/Mercado Pago — proyecto más grande, aparte
- Endurecer RLS de SELECT en turnos_caja (hoy abierta, sin defensa en profundidad) — pendiente de hace rato, bajo riesgo
- compras /= gastos:
- una tabla para admin donde aparezca cuanto dinero tengo en cada caja/banco/tarjeta/mercado pago...

# Permisos y roles

- Terminar de cablear tiene*permiso() en los gates que faltan: stock.* (remito, historial de precios, actualización masiva, baja, eliminar, editar, cambiar categoría), clientes.\_ (ver módulo, importar CSV), reportes.ver_modulo
- Nuevo permiso granular: editar imágenes de producto sin poder tocar stock (separar de stock.editar_producto, que hoy los agrupa)
- Filtro de egresos por rol en caja/page.tsx (hoy no usa tiene_permiso, inconsistencia menor)

# Modulo de Ventas:

- Lectura de código de barras
- tema impositivo en ticket. Facturación / integración fiscal

# Creacion de un producto

- en creacion/edicion/csv que aparezca la opcion de impuestos basicos como dropdown para agregarle a un producto, por ejemplo IVA 21%

# Catálogo y stock

- actualmente se puede cargar un producto a traves de un sheet de crear nuevo producto, carga de producto masivo a traves de un csv y editar un producto sumar stock a la variante. Pero si voy a implementar los codigos SKU, no deberia dar una opcion con mayor agilidad? ejemplo: escribo codigo, enter y no me desenfoca el input, sigo escribiendo.
- Historial de movimientos por producto (auditoría)
- Compartir uno o varios productos por WhatsApp/redes sin salir del POS — necesita diseño, todavía sin resolver cómo
- Soporte de .xlsx en importación de clientes (hoy solo CSV)
- asistente de Orden de Compra; el sistema te sugiere que comprar y en que cantidades, en base a las ventas de un periodo determinado, stock minimo o ideal configurado, y el stock actualmente disponible.

# Clientes

- Chequeo de duplicados en importación CSV (re-subir el mismo archivo hoy crea clientes nuevos en vez de actualizar)
- Envío por localidad en el checkout del catálogo público — pausado hace tiempo
- link o algo para que un cliente pueda ver la deuda que tiene en el negocio y la pueda pagar.
- ahora aparece en deuda y en feche de vencimiento se pone en mora. Pero quiero que fecha de vencimiento quede limpio y que en mora o vencido, sera un tercer estado.

# Modulo de Reportes:

- Conectar promociones con modulo de reportes. total descontado,promoción más usada, ventas con promoción, impacto en margen, descuento promedio
- fixear y mejorar la inteligencia del advisor banner de recomendaciones que aparece en el modulo de reportes, y sirve para que el dueño de negocio sepa que hacer con esos datos.

# 🔮 Fase 5: Expansión y Escalabilidad (Fundación SaaS/multi-tenant)

- [ ] **landing page y Blog + Tutoriales**
- [ ] **Multi-Tenant:** Refactor a `negocio_id` en todas las tablas para soportar miles de empresas en una sola base de datos (Modelo SaaS auto-gestionable).
- [ ] **Facturación Electrónica:** Integración con ARCA.
- [ ] **Impresión de Tickets:** Integración con impresoras térmicas ESC/POS (Bluetooth/USB) directas desde la web.
- [ ] **Presupuestos y Órdenes:** Estados de venta (Cobrado, Presupuesto, A Confirmar). Clave para oficios o ventas grandes.
- [ ] **Separacion de modulos:** 25% off pago anual
      Plan 1 — Emprendedor: $30.000 mensual
      Plan 2 — Gestión / Profesional: $50.000 mensual
      Plan 3 — Empresa / Multi-sucursal: $70.000
- [ ] **Carga de stock por voz/texto**
      Agente de IA (WhatsApp/app)

- arreglar categorias y sub-categorias
- que el usuario pueda elegir una industria: quiosco, herboristeria, ferreteria, carniceria, indumentaria, y en base a eso el sistema como que plante un seed, de variantes, tabla de csv, y nose que otras cosas.
- para eso tengo que armar para vender por peso




# ÉPICA — Jerarquía real de categorías + vocabulario de Género + CSV
 
## Objetivo
Convertir la jerarquía de categorías de "fachada rota" a feature real, con el modelo padre=audiencia / subcategoría=tipo de prenda, vocabulario cerrado de Género, navegación mobile de dos niveles, y el parser de CSV alineado (marca + bebé/beba). Todo diseñado para que el resultado sea el primer **seed de industria: Indumentaria** — reusable en el onboarding futuro.
 
## Decisiones ya tomadas (no re-discutir en implementación)
- Árbol: padres = Ropa Hombre / Ropa Mujer / Ropa Bebé / Ropa Niños. Subcategorías = tipo de prenda (repetibles entre padres: "Remeras" existe bajo Hombre, Niños y Bebé como filas distintas).
- "Ropa Interior" NO es padre: Boxer → Ropa Hombre; Bombacha, Corpiño, Cola Less/Culotte, Conjuntos → Ropa Mujer.
- Género = atributo de variante con lista CERRADA: Mujer, Hombre, Nena, Nene, Beba, Bebe, Unisex. Requerido solo en Ropa Bebé y Ropa Niños (vía categoria_atributos). Para Hombre/Mujer queda implícito en el padre — no se exige.
- Marca = columna opcional a nivel producto (ya decidido antes; no es atributo ni categoría).
- Búsqueda es transversal (ignora jerarquía); navegación es jerárquica (chips de dos niveles).
- Talles: meses en Bebé (0-24m), numéricos en Niños — es el criterio que separa esas dos audiencias.
---
 
## FASE 1 — Modelo de datos y fix del bug de base
 
**T1.1 — Arreglar el bug del form de categorías que asigna parent_id equivocado.**
Reproducción conocida: crear "Abrigos" con subcategorías Camperas/Buzos/Chalecos → quedaron colgadas de "Boxer" y Abrigos sola. Diagnosticar (probable: índice/id desfasado entre el array de subcategorías y el padre recién creado, o el padre se resuelve antes de tener id). Fix + test del caso exacto.
✔ Criterio: crear padre + N subcategorías en una sola pasada las deja correctamente vinculadas; editar el padre de una subcategoría existente funciona.
 
**T1.2 — Reactivar la UI de subcategorías en Configuración.**
Quitar el "Próximamente" que pusimos como tapa. El manager de categorías muestra árbol de dos niveles (padres expandibles), permite crear/editar/mover subcategorías entre padres, y arrastra el `orden` existente.
✔ Criterio: el árbol completo de indumentaria se puede armar desde la UI sin tocar la base.
 
**T1.3 — Cablear categoria_atributos (la tabla "de fachada" pasa a funcionar).**
En el manager de categorías: por categoría, poder marcar qué atributos aplica y cuáles son `requerido` (la tabla ya tiene el modelo exacto: categoria_id + atributo_id + requerido + orden). Seed: Ropa Bebé y Ropa Niños → Género requerido; todas → Talle y Color opcionales.
✔ Criterio: consultar categoria_atributos de "Ropa Bebé" devuelve Género como requerido.
 
**T1.4 — Form de producto/variantes lee categoria_atributos.**
Al elegir categoría (o subcategoría — hereda del padre), el form de variantes pre-carga los atributos declarados: los requeridos aparecen ya agregados y no se puede guardar sin valor; los opcionales aparecen sugeridos en el dropdown (encima de la lista de "atributos ya usados" que ya conectamos al RPC de autocomplete).
✔ Criterio: crear producto en Ropa Bebé exige Género; crear en Ropa Hombre no lo pide.
 
**T1.5 — Vocabulario cerrado de Género.**
Los valores válidos del atributo Género son la lista cerrada (Mujer/Hombre/Nena/Nene/Beba/Bebe/Unisex) + mapa de sinónimos canonicalizados (nena→Nena, niño→Nene, beba→Beba, etc. — unificar con el mapa que ya existe en el parser de remitos, UNA sola fuente, no dos mapas). En el form de variantes, Género se elige de dropdown cerrado, no texto libre. Cualquier valor fuera de lista en imports → advertencia con confirmación, nunca creación silenciosa (ni de valor nuevo ni de categoría espuria — el bug de la semana pasada).
✔ Criterio: no existe camino por el cual "Beba" y "beba" terminen siendo dos valores distintos, ni por el cual un género desconocido cree una categoría.
 
---
 
## FASE 2 — Migración de datos existentes (los 2 comercios)
 
**T2.1 — Mapa de migración de categorías planas → árbol, por comercio.**
Script/consulta que liste las categorías actuales de cada proyecto (Evens + estilobonito) con su conteo de productos, y una propuesta de mapeo (Boxer → subcategoría de Ropa Hombre, etc.). El mapeo se revisa A MANO con cada clienta (o con Nacho) antes de ejecutar — las categorías reales pueden tener nombres que no anticipamos.
✔ Criterio: tabla de mapeo aprobada por comercio antes de tocar datos.
 
**T2.2 — Ejecutar la migración (por comercio, con el mapeo aprobado).**
Crear los padres, re-parentar las categorías existentes (UPDATE de parent_id — las categorías conservan su id, así los productos no se tocan), crear las que falten. Vía migración/script auditado, no SQL suelto en Studio.
✔ Criterio: cero productos huérfanos; conteos por categoría antes/después idénticos; catálogo público sigue mostrando todo.
 
**T2.3 — Backfill de Género donde es derivable.**
Productos en subcategorías de Ropa Bebé/Niños sin atributo Género: derivarlo si la planilla original lo traía (columna Genero de los CSV ya importados) o marcarlos en un reporte para carga manual. No adivinar por nombre de producto.
✔ Criterio: reporte de cuántos quedaron sin género para que la clienta los complete.
 
---
 
## FASE 3 — Navegación de dos niveles (mobile-first)
 
**T3.1 — Chips de dos niveles en catálogo público.**
Nivel 1: chips de padres (Ropa Hombre / Mujer / Bebé / Niños). Al elegir uno: breadcrumb ("Ropa Bebé ›") + chips de sus subcategorías. Estado en la URL (extiende el ?categoria= que ya existe — definir ?categoria=<padre-slug>&sub=<sub-slug> o slug jerárquico, consistente con los links compartibles ya construidos).
✔ Criterio: en un celular real, llegar de home a "Ropa Bebé > Remeras" toma 2 taps; back del navegador deshace un nivel por vez; los links compartidos de categoría siguen funcionando.
 
**T3.2 — Mismo patrón en Stock y POS/VENDER.**
Los chips de categoría de inventario y del POS pasan al mismo modelo de dos niveles. Los contadores facetados (ya implementados) respetan la jerarquía: el chip de un padre suma sus subcategorías.
✔ Criterio: filtrar por padre muestra los productos de todas sus subcategorías; filtrar por subcategoría muestra solo esa.
 
**T3.3 — Búsqueda transversal explícita.**
El buscador (catálogo, stock, POS) ignora el filtro jerárquico activo… o mejor: buscar "remera" con "Ropa Bebé" seleccionado busca dentro de Bebé, pero muestra un aviso "ver N resultados en todo el catálogo" para escapar del filtro en un tap. Cada resultado transversal muestra su breadcrumb (Ropa Niños › Remeras) para distinguir homónimos.
✔ Criterio: buscar "remera" sin filtros trae las de Hombre, Niños y Bebé juntas, distinguibles entre sí.
 
---
 
## FASE 4 — Parser de CSV/remito alineado
 
**T4.1 — Columna Marca.**
Aceptar encabezado Marca/MARCA/Brand como opcional → `productos.marca` (columna ya existente por decisión previa; si aún no se creó, migración chica acá). Celda vacía o columna ausente = no tocar marca existente (mismo criterio que definimos para SKU).
✔ Criterio: la planilla real de ropa de bebé (con Marca) importa completa; re-importar sin la columna no borra marcas.
 
**T4.2 — Género con vocabulario cerrado en el parser.**
El parser usa el MISMO mapa canónico de T1.5 (import compartido). Acepta Beba/Bebe/beba/bebé/etc. Valor no reconocido → fila marcada en amarillo en la previsualización con "Género no reconocido: 'X' — ¿mapear a…?" y dropdown; nunca sigue de largo.
✔ Criterio: las dos planillas reales de esta semana (interior + bebé) importan sin intervención; una con "Adolescente" inventado frena esa fila y pregunta.
 
**T4.3 — Reporte de mapeo de columnas al importar.**
Antes de procesar, mostrar "Detecté: SKU, Género, Producto, Marca, precio, talle, color, stock → mapeando así: …" con confirmación. Columnas desconocidas listadas como "ignoradas" visiblemente (no en silencio).
✔ Criterio: el cambio de estructura entre planillas de días distintos (como te pasó) se ve ANTES de importar, no después.
 
**T4.4 — Categoría/subcategoría en el import.**
Definir cómo el CSV declara la subcategoría destino: columna Categoria acepta "Ropa Bebé > Body" (jerárquico) o solo "Body" (si el nombre de subcategoría es único, resolver; si existe bajo dos padres, la previsualización pide elegir). Actualizar la plantilla descargable con las columnas nuevas y una fila de ejemplo de cada audiencia.
✔ Criterio: importar un CSV con "Body" lo cuelga del padre correcto o pregunta si es ambiguo.
 
---
 
## FASE 5 — Empaquetar como seed "Indumentaria" (cierra el círculo con el roadmap)
 
**T5.1 — Extraer el árbol + reglas a un seed declarativo.**
Un archivo (JSON/TS) con: categorías padre+sub, atributos (Talle/Color/Género), reglas de categoria_atributos, y el vocabulario de sinónimos — el mismo contenido que migró Evens, como plantilla. El provisioning de un comercio nuevo de indumentaria lo aplica en un paso.
✔ Criterio: el seed aplicado a un proyecto vacío deja el árbol completo listo, idéntico al de Evens post-migración.
 
**T5.2 — Documentar el formato de seed para futuras industrias.**
Un README corto: qué campos tiene un seed, cómo se agregaría "Quiosco" o "Carnicería" (sin implementarlos — solo que el formato no sea indumentaria-céntrico por accidente). Nota explícita: carnicería requiere venta-por-peso antes de tener seed útil.
✔ Criterio: alguien (vos en 3 meses) puede crear un segundo seed sin ingeniería inversa.
 
---
 
## Orden y dependencias
F1 completa → F2 (migrar sin el bug de parent_id arreglado sería suicida) → F3 y F4 en paralelo (no se pisan) → F5 al final (empaqueta lo aprendido).
Regla de siempre: cada fase con migración aplicada a AMBOS proyectos + código deployado + smoke test, verificados juntos.
 
## Fuera de alcance de esta épica
- Seeds de otras industrias (solo el formato queda documentado).
- Venta por peso.
- Filtro por marca en catálogo (marca se guarda, no se filtra todavía).