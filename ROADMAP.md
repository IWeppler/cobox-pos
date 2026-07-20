El backlog completo, por módulo

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

- [ ] **landing page**
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
