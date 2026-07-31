Ayudar a vender más, estar organizado y prever qué está pasando en el negocio.

ideas:
- mejorar ux de seleccion multiple dentro del modulo de /stock. Actualmente se abre una barra abajo que no me deja avanzar de pagina y necesito que tenga simplemente para ver cantidad de productos seleccionados y acciones entonces ahi pongo que accion quiero hacer: editar precios, eliminar, cambiar de categoria, subcategoria.
- ver historial de productos cargadaos a traves de remitos. como agrupaciones y luego detalle de cada remito. Esto va de la mano con la mejora de la creacion de la pagina de movimientos que actualmente ni siquiera me esta leyendo los productos que ingresan a traves de remitos, no tiene paginacion, creo que podria tener mas filtros y podemos poner esto que digo directamente ahi adentro.
- Badges de stripe. Utilizar tal vez claude design  
- Atajos con teclado.
- Agregar mas campos a CLIENTES: Razon social/Nombre, CUIT, Condicion IVA:
- Login con huella: Entrás con tu huella o Face ID en vez de escribir la contraseña cada vez.
- Multi-sucursal: Hasta 5 sucursales bajo la misma cuenta, con stock y caja independientes.
- UX, caso Evens, 1 dueña, 2 negocios. Switch de negocio tipo github.
- Exportación contable: Resumen de IVA, libro de ventas y compras, caja X y Z: un Excel listo para tu contador.
- Conectar mercado pago para que te aparezca el qr y que te avise que se pago. entiendo que no sirve si tenes varias vendedoras en un local. Se puede hacer si tengo muchas vendedoras?
- Agregar mas Datos de la empresa: nombre comercial +/ razon social, cuit. etiquetas de codigo de barra: a4, 50x30, 40x25, modo de facturacion: AFIP Manual (generar cuando se necesite), AFIP Automatico, Ticket Interno (Sin Afip)
- Alicuota IVA (creacion de productos): 21% general; 10,5% alimentos básicos, carne, panificados, harinas; 0% exento.



# TIER 1 — Plata correcta y operación diaria (2-4 semanas)

## Caja:

1.  Retiros de dueño como movimiento separado.
2.  Tabla admin "cuánto tengo en cada caja/banco/MP" (alto valor para dueñas, y es agregación de datos que ya tenés).
3.  Marcar esperado-negativo como revisado.
4.  Compras ≠ gastos.


## EPIC 1 — Datos Fiscales de la Empresa
Objetivo: poder configurar correctamente un comercio argentino.

### Empresa
 Nombre comercial
 Razón social
 CUIT
 Condición IVA
 Inicio de actividades
 Dirección fiscal
 Provincia
 Localidad
 Teléfono
 Email
 Logo

### Configuración Fiscal
 Tipo de comprobante por defecto
 Ticket interno
 Factura manual
 Factura automática (ARCA)
 Punto de venta
 Certificados ARCA

## EPIC 2 — Clientes Fiscales
Falta prácticamente convertir un cliente "comercial" en un cliente "fiscal".

###  Datos
 Razón Social
 Nombre Fantasía
 CUIT
 Condición IVA
 Dirección
 Provincia
 Localidad
 Código Postal
 Email
 Teléfono

### Extras
 Observaciones
 Límite de crédito
 Lista de precios
 Historial de compras


## EPIC 3 — Productos Fiscales
Falta agregar:

 Alícuota IVA
 Código interno
 Unidad de medida
 Exento / Gravado
 Código AFIP (si aplica)

## EPIC 4 — Facturación Electrónica (ARCA)
Esta es una épica enorme.

La dividiría.

### Configuración
 Conectar ARCA
 Validar certificados
 Estado conexión

### Emisión
 Factura A
 Factura B
 Factura C
 Nota Crédito
 Nota Débito


## EPIC 5 — IVA
No empezaría por liquidaciones complejas.
Primero lo básico.

### Dashboard IVA

 IVA Débito
 IVA Crédito
 IVA Neto

### Productos

 21%
 10.5%
 27%
 Exento
 No Gravado

### Ventas
Que automáticamente calcule.
No pedirle al usuario hacer cuentas.


## EPIC 6 — Contabilidad
Acá creo que hay mucho valor.

### Exportaciones
 Libro IVA Ventas
 Libro IVA Compras
 Caja diaria
 Caja X
 Caja Z
 Excel movimientos
 CSV

### Reportes
 Ventas por día
 Ventas por categoría
 Medios de pago
 Clientes
 Productos



# TIER 2 — Decisión de arquitectura SaaS (antes del tercer cliente, no después)

1. Multi-tenant (negocio_id): decidilo YA, con lo aprendido. El segundo comercio te mostró el costo real del modelo por-proyecto: drift infinito, cada categoría de schema (policies, constraints, columnas) rompiéndose por separado. Mi recomendación: el refactor a negocio_id es grande pero se hace UNA vez; el drift lo pagás por cliente por siempre. Con 2 clientes es el momento más barato de tu vida para hacerlo. Si decidís quedarte con por-proyecto igual, entonces la automatización del provisioning (runbook + script + diff de esquema) deja de ser opcional y pasa a ser producto interno de primera clase.

2. Landing page + blog/tutoriales — en paralelo (no depende de código del POS), es lo que te permite vender mientras construís.

3. Separación de módulos/planes ($30k/$50k/$70k) — requiere gating por plan; diseñarlo junto con la decisión multi-tenant porque el "qué plan tiene este negocio" vive en la misma capa que negocio_id.
   IVA: dropdown de impuesto en producto (creación/edición/CSV) — es el prerrequisito chico de la facturación ARCA de Fase 5; hacelo antes y la integración fiscal después se apoya en datos ya cargados.

# TIER 3 — Diferenciadores con IA (después de Tier 2, porque venden el SaaS)

🤖 Asistente de Orden de Compra — el mejor candidato de toda tu lista: "qué comprar y cuánto" en base a ventas del período + stock mínimo + stock actual. El 80% es cálculo determinístico (que es lo que lo hace confiable); la capa IA es el resumen en lenguaje natural ("se viene el invierno y las camperas rotaron 3x más que el mes pasado"). Es demo perfecta para vender el SaaS.

🤖 Carga de stock por voz/texto — ya tenés la mitad construida sin darte cuenta: el parser de remitos + diccionario_alias ES el motor de interpretación; voz/texto libre es otra entrada al mismo pipeline. Por eso va después del asistente de compra: comparte piezas y para entonces el pipeline está más maduro.

# TIER 4 — Expansión de mercado (cuando el SaaS ya factura)

1. Facturación electrónica ARCA (con el IVA de Tier 2 ya cargado).

2. Impresión térmica ESC/POS — suele ser condición de adopción para quioscos/carnicerías; para indumentaria fue esquivable, para el mercado amplio no.

3. Presupuestos y estados de venta (Cobrado/Presupuesto/A Confirmar).

4. Seeds por industria (quiosco, ferretería, carnicería...) + venta por peso — van juntos: venta por peso es el prerrequisito técnico de carnicería/verdulería, y los seeds son lo que hace que el onboarding self-service del SaaS no arranque en blanco.

5. Categorías y subcategorías reales (parent_id + categoria_atributos funcionando de verdad) — encaja acá porque los seeds por industria lo necesitan; mientras tanto el campo queda oculto como ya definimos.

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


<!-- - Emprendedor ($30k): caja + ventas + stock + catálogo público básico. Sin cuenta corriente (o con tope chico de clientes), sin reportes avanzados, sin multi-caja.
- Gestión ($50k): + cuenta corriente/fiado completo (tu diferencial más fuerte para el interior, casi nadie gastronómico lo tiene bien resuelto), + reportes, + multi-caja/roles.
- Empresa ($70k): + multi-sucursal, + facturación fiscal (cuando esté ARCA), + integraciones (impresora térmica, código de barras avanzado). -->


 Seeds por industria (quiosco, ferretería, carnicería...)
<!-- "Tu arquitectura ya está bastante bien parada para esto sin saberlo: producto_variantes.atributos es JSONB libre — "Talle"/"Color" no están hardcodeados en el schema, son solo los valores que Evens usó. Un quiosco puede simplemente no usar atributos (cada producto es su propia variante única), y categoria_atributos (la tabla que encontraste "de fachada") es exactamente la pieza pensada para declarar qué atributos aplican por categoría/rubro — hoy sin terminar, pero es la dirección correcta para los seeds por industria que ya tenías en el backlog.

Quiosco — el más fácil de los tres. Productos de SKU único (sin talle/color), altísimo volumen de tickets chicos. Lo que más necesita ya está en tu Tier 1: código de barras + carga rápida por SKU. Fiado también es común en quioscos de barrio, así que tu módulo de clientes/cuenta corriente aplica igual. Prácticamente sin desarrollo nuevo, es configuración.

Herboristería — fácil-medio. Mezcla de productos por unidad (empaquetados, con código de barras) y a granel (hierbas sueltas por peso/cucharada). La parte por unidad no pide nada nuevo; la parte a granel necesita lo mismo que carnicería, aunque menos central al negocio.

Carnicería — la que sí exige una feature nueva de verdad: venta por peso. Hoy tu sistema asume cantidad entera (1, 2, 3 unidades). Vender por kg necesita cantidad decimal de punta a punta: línea de venta, descuento de stock, cálculo de precio, reportes — no es un flag, es tocar el camino completo de la venta. La integración con balanza (Bluetooth/USB) es la versión "de lujo" — con carga manual del peso por teclado ya funciona sin hardware. Es la única de las tres que no podés resolver por configuración; es la que corresponde planificar como feature real, tal como ya la tenías anotada." -->