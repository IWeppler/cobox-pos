Los labels, modulos, estan clasificados en #
Los items que tienen ✅ al principio significa que ya estan hechos
Los items que tienen ### al principio significa que estoy trabajando

REPORTE POR CANAL DE VENTAS: Instagram, local, POS

# ✅ Core implementado

✅ 1 - Apertura y Cierre de Caja: Control de turnos. "El empleado Juan abrió la caja con $10.000 y la cerró con $45.000". Fundamental para la paz mental del dueño.

✅ 2 - Ventas sin Fricción: Permitir ventas con stock negativo (mostrando una ⚠️ alerta visual). La realidad física manda; nunca bloquees una venta.

✅ 3 - Métodos de Pago Base: Implementar un selector al cobrar: Efectivo (por defecto), Tarjeta, Transferencia/App.

✅ 4 - Pantalla de "Venta Realizada": El modal de éxito final con el botón estrella: "Enviar Comprobante por WhatsApp". Tu motor oculto de marketing.

✅ 5 - Detalle y Ganancia: La pantalla de resumen de cada venta que le muestre al dueño exactamente cuánta ganancia neta le dejó esa operación específica.

✅ 6 - Devoluciones Simples: Un botón de "Registrar Devolución" con motivo, preguntando si el stock y el dinero vuelven a sus lugares. Nada de "Notas de Crédito" complejas aún.

✅ 7 - Descuentos Comerciales: Botón en el carrito para aplicar descuento por % o monto fijo. Ideal para el marketing cruzado que planeaste.

✅ 8 - Insights y Gráficos: Evolución de ventas y horarios pico, pero traducidos a lenguaje humano. Tarjetas con 💡 consejos (ej: "Asegura cambio a las 18hs, es tu pico de ventas"). Mantener el ranking de Mayor Rotación.

# Improves:

✅ mejorar ui carrito de venta

✅ modificacion de precios masivos

✅ boton de descargar pwa

✅ ticket en formato pdf

✅ dark/light mode

✅ mejorar el dashboard inicial y mejorar el modulo de reportes/metricas

✅ El modulo de reportes: quiero traer por fechas el Flujo de Ingresos Diarios; Ventas por Categoría no me trae correctamente las funciones; Rentabilidad por Categoría tiene el mismo problema ademas el chart no se ve bien.

✅ modulo de reportes: margen operativo estimado en porcentaje, falta ver el monto en $ asociado.

✅ Ingresos Brutos vs Ganancia Bruta: micro-copy. Total vendido antes de costos y gastos. y Ingresos menos costo de mercadería.

✅ Reportes / Ventas: Agregaría ventas por día/hora.

✅ Ventas por categoría debería tener selector de métrica: [Ingresos] [Unidades] [Tickets]

✅ Reportes/Inventario: Agregaría “valor potencial de venta”

✅ Además de capital inmovilizado al costo, sería útil mostrar: Valor al costo: $X; Valor potencial de venta: $Y; Ganancia potencial: $Z

✅ Productos sin movimiento: definir ventana: hace 30 días - hace 60 días - hace 90 días

✅ en el modulo de stock debo poder ordenar en la tabla por nombre (a-z), mas/menos stock (ej: -5, 1000), orden mayor/menor costo, orden mayor/menor precio venta, y filtro stock-bajo (solo con stock ej: 0 o -10).

✅ Relación bajas/ingresos: Muy buen KPI: Bajas sobre ingresos: 2.4%. Porque $20.000 en bajas puede ser mucho o poco según cuánto vendiste.

# 🐛 Bugs / Correcciones necesarias

✅ Reportes: Ventas por categoría no calcula correctamente.
✅ Reportes: Rentabilidad por categoría no calcula correctamente.
✅ Reportes: chart de rentabilidad por categoría no se ve bien.
✅ Revisar obtención de datos por rango de fechas.
✅ Revisar consistencia entre ingresos, ganancia, caja y descuentos.

# Features para terminar el MVP:

Considero que las features postergadas son indispensables para los planes de gestion/profesional y empresa, pero no tengo clientes en esa parte, tal vez 1 para gestion profesional.

# Modulo de Configuracion:

✅ 1. configuracion/promociones: Mejorar la configuracion de promociones. Fecha de inicio y fin, activo/inactivo. editar, borrar.
✅ 2. configuracion/metodos-de-pago: Métodos de pago configurables. Efectivo: 0%, acreditación inmediata; Transferencia: 0%, inmediata; Mercado Pago: 6%, 1 día; Crédito: 8%, 10 días.

# Modulo de Ventas:

✅ 3. Comisiones por método de pago (bruto cobrado, comisión estimada, neto estimado). Ejemplo: Tarjeta: $100.000 - Comisión: $6.000 = Neto: $94.000
✅ 4. Método de pago mixto: una venta puede tener 2 metodos de pago. Acá tengo una observación: es muy útil, pero puede complicar bastante caja y reportes. Ejemplo: Venta $100.000; $40.000 efectivo; $60.000 transferencia.

-- Postergado. Lectura de código de barras
-- Postergado. Devoluciones y anulaciones. Distinguir: anular venta completa; devolución parcial; cambio de producto; devolución con reintegro; devolución a cuenta corriente
-- Postergado. tema impositivo en ticket. Facturación / integración fiscal

# Modulo de Store:

✅ 5. Datos del negocio ubicados en el catalogo: direccion, nombre, logo, redes sociales y whatsapp (icons) y categorias

# UI:

✅ 9. Revisar y corregir UX/UI para mobile. fundamental.
✅ 12. mejorar flujo del boton de registrar venta y registrar venta en general: ahora existe un panel POS especifico para vender y deja de existir los modales y sheet
✅ creacion de modal para saber con cuanto paga el cliente para darle el cambio
✅ mejorar la vista en grilla
-- mejorar el envio de comprobante: actualmente se abre el link para enviar a traves de whatsapp pero demoró muchisimo la apertura en whatsapp, ademas si hay que enviar varios y que cada vez se tenga que abrir whatsapp es incomodo. Creo que la mejor opcion es descargar un pdf y que se lo envie

✅ 13. En el catalogo hay que mejorar el flujo de variantes de un producto. actualmente aparecen [blanco/M] [Blanco/L] [Negro/M] [Negro/L] y quiero que aparezca [Blanco] [Negro] / [M] [L]
✅ 14. Corregir buscador de catalogo: en el navbar tengo un el searchbar para buscar productos que es como una especie de filtro que actua instantaneamente en el catalogo, pero preferiria que en realidad simplemente busque y me aparezca abajo los resultados, ademas que se pueda buscar por productos o categorias.
✅ 15. Corregir marquee de catalogo: actualmente no se esta moviendo y necesito que se empiece a mover..
✅ 16. Corregir CTA de banner en catalogo: hay que chequear bien como funciona, porque actualmente parece que tiene la redireccion a # y en realidad deberia redirigir dependiendo la campaña o configuracion hacia una categoria de plantas o producto en particular o nose...
✅ 17. corregir categorias de catalogo: actualmente aparecen todas juntas en minusculas y no como estan configuradas en el panel de administracion o aparecen en la base de datos..
✅ 18. Corregir carrito del POS catalogo, 19. mejorar zustand carrito para clientes en catalogo: parece que son dos problemas que van de la mano hace un rato me aparecia como el carrito del pos y no para enviar pedido.

-- que la direccion en el catalogo sea clickeable: en configuracion dejar un input para que ponga directamente las coordenadas o link para redirección del local para que en el catalogo un usuario pueda hacer click y que lo redirija a google maps

# Creacion de un producto

-- producto basico, producto con variantes, producto con medidas
-- se deberia poder crear una categoria si no tengo creada... Debe haber una opcion si queremos que la categoria se muestre en la tienda/catalogo
-- no deberia aparecer si es visible o no.
-- estaria bueno que aparezcan impuestos basicos como dropdown para agregarle a un producto, por ejemplo IVA 21%

# Fix Bug:

✅ 10. Advisor-Banner: aparece todo el tiempo. Deberia aparecer una vez al dia.
✅ 11. El light/dark mode no funciona correctamente, falta un zustand o algo que persevere.

# Modulo de Reportes:

-- Postergado. Exportar datos: ventas; inventario; clientes; caja; reportes
-- Postergado. conectar promociones con modulo de reportes. total descontado,promoción más usada, ventas con promoción, impacto en margen, descuento promedio

✅ 6. Estandarización Dinámica: Mover Categorías y Variantes (talles, colores) a la base de datos para que cada negocio cree las suyas propias.

-- 8. Separacion de modulos:
Plan 1 — Emprendedor:
Plan 2 — Gestión / Profesional:
Plan 3 — Empresa / Multi-sucursal:

# Admin:

-- Postergado. Presupuestos y Órdenes: Estados de venta (Cobrado, Presupuesto, A Confirmar). Clave para oficios o ventas grandes.

-- Postergado. Módulo CRM Opcional: Si el negocio lo desea, puede pedir Nombre y WhatsApp/numero de telefono, al cobrar para ir armando su propia base de datos de clientes. cliente, venta fiada, saldo pendiente, pago posterior, historial de deuda
Flujo mínimo que deberías implementar.

---

## 🚀 Fase 3: CRM y Cuentas Corrientes (Próximos pasos)

- [ ] **Tabla Clientes:** Crear el módulo de CRM (Nombre, Tel, DNI, Email, Notas).
- [ ] **Vincular Ventas:** Selector de clientes en la Terminal POS para asignar cualquier tipo de venta (Efectivo o Crédito) al historial del cliente.
- [ ] **Cuentas Corrientes (Ledger):**
  - Tabla `movimientos_cc` (Cargos por compras vs. Abonos/Pagos a cuenta).
  - Interfaz para registrar pagos parciales o dejar saldo a favor.
- [ ] **Reglas Flexibles (JSONB):** Capacidad de asignarle a un cliente reglas dinámicas de crédito (Ej: Límite de $100.000, recargo del 15%, o exigir 50% de entrega).

## 🛠 Fase 4: Operación Avanzada (Multi-Caja y Permisos)

- [ ] **Sistema RBAC (Roles y Permisos Granulares):**
  - Tabla de `roles` y `permisos` dinámicos (Ej: "ver_costos", "abrir_caja", "eliminar_venta").
  - UI para que el dueño asigne qué puede hacer cada empleado.
- [ ] **Multi-Caja:** Soporte para múltiples turnos de caja abiertos simultáneamente en diferentes dispositivos (Terminal 1, Celular Vendedora 2).
- [ ] **Impresión de Tickets:** Integración con impresoras térmicas ESC/POS (Bluetooth/USB) directas desde la web.

## 🔮 Fase 5: Expansión y Escalabilidad (SaaS)

- [ ] **Multi-Tenant:** Refactor a `negocio_id` en todas las tablas para soportar miles de empresas en una sola base de datos (Modelo SaaS auto-gestionable).
- [ ] **Facturación Electrónica:** Integración con AFIP (Argentina) / SII (Chile) / DIAN (Colombia) según el país objetivo.
- [ ] **Módulo de Compras a Proveedores:** Para cargar stock automáticamente a partir de remitos e impactar en los costos promedio.

---

🚀 ÉPICA 6: CRM y Cuentas Corrientes (Ledger)

Objetivo: Implementar la gestión de clientes separando claramente la identidad/historial (CRM) de su situación crediticia (Cuentas Corrientes), integrándolo transversalmente en todo el sistema POS.

🗄️ Fase 1: Infraestructura & Tipos (Base de Datos)
Objetivo: Sentar las bases inmutables para la contabilidad de partida doble.

[x] SQL clientes: Crear tabla con datos básicos y JSONB para reglas_credito.
[x] SQL cuenta_corriente_movimientos: Crear el "Ledger" (Libro Mayor) para auditar cada débito y crédito.
[x] Tipos TypeScript: Actualizar las interfaces base.
[x] Migración de Ventas: Asegurar que ventas tenga la foreign key cliente_id y los campos de monto_cobrado y monto_pendiente estén operativos.

⚙️ Fase 2: Reglas de Negocio (Configuración)
Objetivo: Que el dueño del local pueda definir cómo funciona el "fiado" en su negocio.

[x] UI Configuración (/configuracion): Agregar panel de "Cuentas Corrientes"
[x] Parámetros Globales: \* Activar/Desactivar Cuentas Corrientes en el local.

Recargo por defecto (Ej: +15% si no paga al contado).
Anticipo mínimo (Ej: Exigir que pague el 50% de la venta para poder fiarle el resto).


👥 Fase 3: Módulo Principal CRM (/clientes)
Objetivo: La base de operaciones para gestionar la relación con el cliente y la cobranza.

[x] UI Layout & KPIs Superiores:
KPI: Total de Clientes registrados.
KPI: Clientes con deuda activa (Morosos).
KPI: "Dinero en la calle" (Total a cobrar).

[x] Tabla de Clientes:
Columnas: Nombre, Contacto, Total Comprado Histórico, Saldo Pendiente, Estado.

[x] Ficha del Cliente (Modal/Sheet Lateral):
Tab 1: Información: Datos de contacto y notas.
Tab 2: Historial de Compras: Lista de todos los tickets asociados a su nombre (Pagados o no).
Tab 3: Cuenta Corriente (El Ledger): Tabla con la historia de sus deudas y pagos (Ej: "Lunes: Sacó $10k. Miércoles: Entregó $4k. Saldo: $6k").

[x] Acción "Registrar Pago": Botón para asentar un cobro de deuda. (Impacta en el Ledger bajando la deuda, y en la Caja Z sumando el dinero ingresado).

🛒 Fase 4: Integración en POS (Checkout Inteligente)

Objetivo: Aplicar las reglas en el mostrador sin ralentizar al cajero.
[x] Selector de Clientes: 
Creado e inyectado en el carrito.

[x] Modal Inteligente de Pagos: 
Alerta de pago parcial / creación de deuda (Hecho en la tarea anterior).

[x] Aplicación de Reglas (Frontend):
 Si el cajero asigna deuda a "Juan", el carrito debe leer si Juan tiene un recargo del 15% y recalcular el total automáticamente.
 Bloquear el botón de "Confirmar" si el dinero entregado no cumple con el Anticipo Mínimo configurado.

[x] Vinculación (Backend):
Guardar el cliente_id tanto si la venta es 100% pagada como si es fiada (para nutrir el CRM).

🔄 Fase 5: Impacto Transversal (Módulos Existentes)

Objetivo: Que el nuevo concepto de Cliente y Deuda se refleje correctamente en todo el software.

[x] Caja y Movimientos (/caja):  
Diferenciar visualmente los ingresos. "Venta Directa" vs "Cobro de Cuenta Corriente". (Ambos suman al efectivo esperado, pero el origen contable es distinto).

[x] Historial de Ventas (/ventas):
Agregar el nombre del Cliente a la tabla (reemplazando el vacío actual).
Agregar "Estado de Pago" (PAGADA, PARCIAL) mediante un Badge (ej: Verde vs Ámbar).
Que el Modal de Detalle de Venta (Ticket interno) muestre si dejó saldo pendiente.


[x] Reportes (/reportes):
Crear nueva pestaña "CRM & Cobranza".
Ranking: Top 5 Mejores Clientes (Por volumen de compra).
Ranking: Top 5 Mayores Deudores.
