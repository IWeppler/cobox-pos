Ayudar a vender más, estar organizado y prever qué está pasando en el negocio.

ideas:
- Para crear usuarios tengo que pedirle a claude code que lo haga. Debo poder crearlo desde el dashboard.

- NO ESTA FUNCIONANDO \ TEMA MARCA Y GENERO PARA EL PRODUCTO. FUNDAMENTAL MEJORAR EL CATALOGO

- ver historial de productos cargados a traves de remitos. como agrupaciones y luego detalle de cada remito. Esto va de la mano con la mejora de la creacion de la pagina de movimientos que actualmente ni siquiera me esta leyendo los productos que ingresan a traves de remitos, no tiene paginacion, creo que podria tener mas filtros y podemos poner esto que digo directamente ahi adentro.

- Pérdida de conexión (Offline): Es la más crítica. Si el local se queda sin internet, la cajera debe saber de inmediato (con un banner permanente en la parte superior) que el sistema está guardando las ventas localmente y que no cierre la pestaña.

- Multi-sucursal: Hasta 5 sucursales bajo la misma cuenta, con stock y caja independientes.

- Agregar mas Datos de la empresa: nombre comercial +/ razon social, cuit. etiquetas de codigo de barra: a4, 50x30, 40x25, modo de facturacion: AFIP Manual (generar cuando se necesite), AFIP Automatico, Ticket Interno (Sin Afip)
- Alicuota IVA (creacion de productos): 21% general; 10,5% alimentos básicos, carne, panificados, harinas; 0% exento.
- Atajos con teclado.
- Login con huella: Entrás con tu huella o Face ID en vez de escribir la contraseña cada vez.

- terminar de hacer la conexión para recuperar contraseñas


1. Landing page + blog/tutoriales — en paralelo (no depende de código del POS), es lo que te permite vender mientras construís.

## EPIC 1 — Datos Fiscales de la Empresa
Objetivo: poder configurar correctamente un comercio argentino.

### Datos Personales
 nombre completo obligatorio
 whatsapp de contacto obligatorio
 email opcional

### Empresa                DONE UI
 Nombre comercial obligatorio
 Razón social
 CUIT
 Condición IVA
 Inicio de actividades
 Dirección fiscal
 Provincia
 Localidad
 Teléfono
 Email
 Logo esto no

### Configuración Fiscal    DONE UI
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

1. types: listo, modal de crear cliente listo
- editar y crear actions: features\clients\actions\manage-clients.ts // 4. CREAR CLIENTE NUEVO // 5. EDITAR CLIENTE
- editar modal: features\clients\ui\edit-client-modal.tsx

3. El "Killer Feature" (Auto-completado con AFIP)
Si quieres que Comerz sea un sistema Premium que se venda solo, los datos fiscales no se deberían tipear a mano.
Dado que ya estamos implementando afip.js en tu backend para emitir facturas, puedes usar esa misma librería para consultar el padrón de AFIP.
El flujo ideal en el POS es:
La cajera escribe el CUIT (ej: 30712345678) y presiona "Enter" o un botón de búsqueda.
Tu backend consulta a ARCA.
Se autocompleta mágicamente la razon_social, condicion_iva y direccion. ¡Cero errores de tipeo y factura generada en segundos!

## EPIC 3 — Productos Fiscales. PAUSADA
Falta agregar:

 Alícuota IVA
 Código interno: SKU Listo, Codigo de  barra Listo
 Unidad de medida: Yo tengo pensado crear una especie de onboarding para la primera cuando se registren o envien su contacto para que seleccionen la industria y en base a eso por ejemplo si es carniceria se le pone peso, si es indumentria es solo unidad, si es quiosco o almacen las dos
 Exento / Gravado
 Código AFIP (si aplica)


## EPIC 4 — Facturación Electrónica (ARCA)
Esta es una épica enorme.

La dividiría.

### Configuración (¡UI ya resuelta!)
 Conectar ARCA
 Validar certificados
 Estado conexión

### Emisión
 Factura A
 Factura B
 Factura C
 Nota Crédito
 Nota Débito


2. Emisión (El próximo gran desafío visual)
Aquí es donde cambia el flujo de la cajera en el mostrador. Cuando el cliente está por pagar, el POS tiene que tomar una decisión automática basada en los datos que cargamos en la Épica 2:
- Si el comercio es Monotributista: Siempre emite Factura C (o Ticket no fiscal).
- Si el comercio es Responsable Inscripto:
- Si el cliente no dio datos (Consumidor Final) ➔ Emite Factura B.
- Si el cliente dio un CUIT y es Responsable Inscripto ➔ Emite Factura A.
- Todo esto debe ocurrir sin que la cajera tenga que elegir el tipo de factura manualmente, reduciendo el error humano a cero.

La Lógica Automática (El Cerebro)
Basado en las reglas de ARCA, la lógica que programaremos en el front-end (y validaremos en el back-end) es esta:
1. Si el Comercio es Monotributista: Siempre emite Factura C (no importa quién compre).
2. Si el Comercio es Responsable Inscripto:
- Si el cliente no está cargado o es Consumidor Final ➔ Factura B.
- Si el cliente es Monotributista o Exento ➔ Factura B (o Factura M en casos raros, pero B es el estándar para MVP).
- Si el cliente es Responsable Inscripto (y tiene CUIT) ➔ Factura A.
3. El "Botón de Escape": Siempre debe haber un switch rápido para emitir un Ticket Interno (No Fiscal) por si el sistema de ARCA está caído o es una venta en negro/interna.


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


## EPIC 6 — Contabilidad 
Acá creo que hay mucho valor. Exportación contable: Resumen de IVA, libro de ventas y compras, caja X y Z: un Excel listo para tu contador.

### Exportaciones
 Libro IVA Ventas
 Libro IVA Compras
 Caja diaria
 Caja X y Caja Z: Que es?
 Excel movimientos



# TIER 3 — Diferenciadores con IA (después de Tier 2, porque venden el SaaS)

Asistente de Orden de Compra — el mejor candidato de toda tu lista: "qué comprar y cuánto" en base a ventas del período + stock mínimo + stock actual. El 80% es cálculo determinístico (que es lo que lo hace confiable); la capa IA es el resumen en lenguaje natural ("se viene el invierno y las camperas rotaron 3x más que el mes pasado"). Es demo perfecta para vender el SaaS.

# TIER 4 — Expansión de mercado (cuando el SaaS ya factura)

1. Facturación electrónica ARCA (con el IVA de Tier 2 ya cargado).
2. Impresión térmica ESC/POS — suele ser condición de adopción para quioscos/carnicerías; para indumentaria fue esquivable, para el mercado amplio no.
3. Presupuestos y estados de venta (Cobrado/Presupuesto/A Confirmar).
4. Seeds por industria (quiosco, ferretería, carnicería...) + venta por peso — van juntos: venta por peso es el prerrequisito técnico de carnicería/verdulería, y los seeds son lo que hace que el onboarding self-service del SaaS no arranque en blanco.
6. Multi-sucursal — y es un vacío real que tu propio pricing ya asumía sin que el roadmap lo dijera. Repasá tu Plan Empresa ($70k): lo llamaste "Empresa / Multi-sucursal" — ya le estás cobrando algo que no existe en ningún lado del roadmap de features. Hay que diseñarlo, y hacerlo distinto y explícito de la decisión de multi-tenant que ya veníamos discutiendo: multi-sucursal es un negocio con varias ubicaciones físicas (mismo dueño, catálogo y clientes compartidos, stock separado por depósito) — es un sucursal_id anidado bajo tu futuro negocio_id, no lo mismo que "muchos negocios distintos en una base". Diseñalos juntos porque son la misma conversación de arquitectura, pero son conceptualmente dos cosas.
7. Integración Tiendanube (y quizás MercadoLibre después) — Dux lo tiene, es un dolor real para comercios argentinos que ya venden en ambos canales sin sincronía de stock (venden el mismo producto dos veces). Tenés razón en que esto no es un feature aislado, es un cluster: necesitás (a) el módulo de órdenes con estados que ya tenías anotado para presupuestos, reusado para pedidos de e-commerce; (b) reportes por canal de venta (mostrador vs. Tiendanube); (c) el flujo de venta con envío, que resucita tu "envío por localidad" pausado — se vuelve prerequisito, no nice-to-have. Es grande; va después de la decisión de multi-tenant, no antes.



 Seeds por industria (quiosco, minimercado, ferretería, carnicería, indumentaria ...)
<!-- "Tu arquitectura ya está bastante bien parada para esto sin saberlo: producto_variantes.atributos es JSONB libre — "Talle"/"Color" no están hardcodeados en el schema, son solo los valores que Evens usó. Un quiosco puede simplemente no usar atributos (cada producto es su propia variante única), y categoria_atributos (la tabla que encontraste "de fachada") es exactamente la pieza pensada para declarar qué atributos aplican por categoría/rubro — hoy sin terminar, pero es la dirección correcta para los seeds por industria que ya tenías en el backlog.

Quiosco — el más fácil de los tres. Productos de SKU único (sin talle/color), altísimo volumen de tickets chicos. Lo que más necesita ya está en tu Tier 1: código de barras + carga rápida por SKU. Fiado también es común en quioscos de barrio, así que tu módulo de clientes/cuenta corriente aplica igual. Prácticamente sin desarrollo nuevo, es configuración.

Herboristería — fácil-medio. Mezcla de productos por unidad (empaquetados, con código de barras) y a granel (hierbas sueltas por peso/cucharada). La parte por unidad no pide nada nuevo; la parte a granel necesita lo mismo que carnicería, aunque menos central al negocio.

Carnicería — la que sí exige una feature nueva de verdad: venta por peso. Hoy tu sistema asume cantidad entera (1, 2, 3 unidades). Vender por kg necesita cantidad decimal de punta a punta: línea de venta, descuento de stock, cálculo de precio, reportes — no es un flag, es tocar el camino completo de la venta. La integración con balanza (Bluetooth/USB) es la versión "de lujo" — con carga manual del peso por teclado ya funciona sin hardware. Es la única de las tres que no podés resolver por configuración; es la que corresponde planificar como feature real, tal como ya la tenías anotada." -->

Modalidad	Precio	      Beneficio
Mensual	   Precio normal	Sin compromiso
Semestral   20%  off       Recomendado

- Emprendedor ($30k/mes): Punto de venta + caja + ventas + Gestión básica de productos + Control de stock + Catálogo online para compartir por WhatsApp + Registro de clientes + Cuenta corriente de clientes (hasta 100 clientes activos, por ejemplo) + Historial completo de ventas + Tickets digitales. Cuenta corriente con tope chico de clientes, sin reportes avanzados, sin multi-caja. 1 solo usuario.
No incluye: Reportes avanzados, Roles de usuarios, Multi caja, Multi sucursal, Integraciones

- Gestión ($50k/mes): + Cuenta corriente completa e ilimitada + Reportes de ventas + multi-caja/roles. Máx 5 usuarios + Reportes por productos + Reportes por categorías + Reportes por fechas + Ranking de productos + Ranking de clientes + Roles de usuarios + Hasta 5 usuarios + Múltiples cajas + Apertura y cierre de caja + Control de movimientos de caja + Historial de acciones (auditoría básica) + Exportación de reportes

- Empresa ($70k/mes): + Múltiples sucursales + Stock por sucursal + Transferencias entre sucursales + Dashboard consolidado + Usuarios por sucursal + Permisos avanzados + Facturación electrónica (cuando esté ARCA) + Integración con impresoras térmicas + Lectores de código de barras + Integraciones futuras + API (si algún día existe)


3. UI para Funciones Bloqueadas (El Candadito)
Para implementar tu idea de la mejor manera en Next.js, puedes crear un componente envoltorio (Wrapper) llamado <PaywallGate>.
- Funcionamiento: Este componente recibe como propiedades el feature que requiere y el plan actual del negocio.
- Si tiene el plan correcto: Renderiza el contenido normalmente (por ejemplo, el botón de "Agregar Empleado").
- Si NO tiene el plan: Renderiza el mismo botón, pero deshabilitado, con un filtro grisáceo, el ícono del candado y una estrellita brillante.
- Llamado a la acción (CTA): Al hacer clic en el componente bloqueado, en lugar de no hacer nada, debe abrir un modal hermoso que diga: "Para usar Multi-Caja necesitas el plan Gestión. [Mejorar mi plan ahora]".


4. ¿Qué más falta? (Los 4 Pilares del SaaS)
- El Flujo de Onboarding (Aprovisionamiento): ¿Qué pasa exactamente cuando un comercio se registra? Tu base de datos debe disparar un proceso automático que cree su "Negocio", le asigne el rol de "Dueño", le asigne un "Plan Trial de 14 días" y cargue categorías o productos de ejemplo para que no vea la pantalla en blanco.

- Estados de Morosidad (Dunning): Si llega el día de cobro y la tarjeta de crédito del cliente rebota, ¿qué pasa? No debes borrar sus datos. El negocio debe pasar a estado "Moroso" (Past Due). Modo Solo Lectura: Cuando un negocio está moroso o cancelado, el SaaS los deja entrar al sistema, pero bloquea las acciones de escritura. Pueden ver sus reportes o productos viejos, pero el botón de "Cobrar en Caja" o "Agregar Producto" desaparece y es reemplazado por un cartel rojo gigante para que paguen.

- Webhooks de la Pasarela de Pago: Tu backend de Supabase tendrá que estar escuchando (mediante Edge Functions o Route Handlers) los avisos de Mercado Pago o Stripe. Cuando la pasarela te avise "Pago exitoso", tu sistema automáticamente extiende la fecha de vencimiento del negocio por un mes más.