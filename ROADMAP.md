estudiar las ventas realizadas, metodo de pago mas rentable, mejores productos, oportunidades de crear combos, etc...

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


# TIER 3 — Diferenciadores con IA (después de Tier 2, porque venden el SaaS)

Asistente de Orden de Compra — el mejor candidato de toda tu lista: "qué comprar y cuánto" en base a ventas del período + stock mínimo + stock actual. El 80% es cálculo determinístico (que es lo que lo hace confiable); la capa IA es el resumen en lenguaje natural ("se viene el invierno y las camperas rotaron 3x más que el mes pasado"). Es demo perfecta para vender el SaaS.

# TIER 4 — Expansión de mercado (cuando el SaaS ya factura)

2. Impresión térmica ESC/POS — suele ser condición de adopción para quioscos/carnicerías; para indumentaria fue esquivable, para el mercado amplio no.
6. Multi-sucursal — y es un vacío real que tu propio pricing ya asumía sin que el roadmap lo dijera. Repasá tu Plan Empresa ($70k): lo llamaste "Empresa / Multi-sucursal" — ya le estás cobrando algo que no existe en ningún lado del roadmap de features. Hay que diseñarlo, y hacerlo distinto y explícito de la decisión de multi-tenant que ya veníamos discutiendo: multi-sucursal es un negocio con varias ubicaciones físicas (mismo dueño, catálogo y clientes compartidos, stock separado por depósito) — es un sucursal_id anidado bajo tu futuro negocio_id, no lo mismo que "muchos negocios distintos en una base". Diseñalos juntos porque son la misma conversación de arquitectura, pero son conceptualmente dos cosas.
7. Integración Tiendanube (y quizás MercadoLibre después) — Dux lo tiene, es un dolor real para comercios argentinos que ya venden en ambos canales sin sincronía de stock (venden el mismo producto dos veces). Tenés razón en que esto no es un feature aislado, es un cluster: necesitás (a) el módulo de órdenes con estados que ya tenías anotado para presupuestos, reusado para pedidos de e-commerce; (b) reportes por canal de venta (mostrador vs. Tiendanube); (c) el flujo de venta con envío, que resucita tu "envío por localidad" pausado — se vuelve prerequisito, no nice-to-have. Es grande; va después de la decisión de multi-tenant, no antes.