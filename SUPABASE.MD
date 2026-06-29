Diccionario de Datos - System POS (Supabase)

Este documento describe el esquema de la base de datos relacional en Supabase para el sistema de Punto de Venta (POS) y Catálogo Online. Actualizado con los tipos de datos exactos de la BD.

### 📦 Módulo de Productos e Inventario

# productos

- Almacena la información principal del catálogo.
  id (uuid, PK)
  nombre (text)
  slug (text, nullable): URL amigable para el catálogo online.
  tipo (text, default: 'Interior'): Categoría principal.
  cuidados (text, nullable, default: 'Luz indirecta')
  descripcion (text, nullable)
  precio (numeric)
  precio_costo (numeric)
  imagen_url (text, nullable): URL de la imagen o string stringificado JSON.
  publicado (boolean, default: true): Si es visible en el catálogo web.
  creado_en (timestamptz)

# productos_stock

- Maneja el inventario desglosado por variantes (talles, colores, etc).
  id (uuid, PK)
  producto_id (uuid, FK -> productos.id)
  variante (text)
  cantidad (numeric/integer)

# bajas

- Registro de pérdidas, roturas o mermas de stock.
  id (uuid, PK)
  producto_id (uuid, FK -> productos.id)
  variante (text)
  cantidad (integer)
  motivo (text)
  estado (text, default: 'PENDIENTE')
  creado_por (uuid, FK -> perfiles.id, nullable)
  creado_en (timestamptz)

# actualizaciones_precio

- Cabecera de aumentos o descuentos masivos.
  id (uuid, PK)
  nombre (text, nullable)
  tipo_alcance (text)
  tipo_operacion (text)
  campo_objetivo (text)
  valor (numeric)
  redondeo (text, nullable)
  cantidad_afectada (integer, default: 0)
  estado (text, default: 'APLICADO')
  creado_por (uuid, FK -> perfiles.id, nullable)
  creado_en (timestamptz)

# actualizaciones_precio_items

- Detalle del impacto de una actualización masiva por cada producto.
  id (uuid, PK)
  lote_id (uuid, FK -> actualizaciones_precio.id)
  producto_id (uuid, FK -> productos.id)
  costo_anterior (numeric)
  costo_nuevo (numeric)
  precio_anterior (numeric)
  precio_nuevo (numeric)
  creado_en (timestamptz)

### 🛒 Módulo de Ventas y Caja

# ventas

- Cabecera de las transacciones (tickets) del POS y Tienda.
  id (uuid, PK)
  total (numeric)
  precio_costo (numeric)
  metodo_pago (text)
  fecha_venta (timestamp)
  vendedor_id (uuid, FK -> perfiles.id)
  turno_caja_id (uuid, FK -> turnos_caja.id)

# ventas_items

- Detalle de productos por cada venta.
  id (uuid, PK)
  venta_id (uuid, FK -> ventas.id)
  producto_id (uuid, FK -> productos.id)
  variante (text)
  cantidad (numeric)
  precio_unitario (numeric)
  precio_costo (numeric)

# ventas_descuentos

- Registro de la promoción aplicada a una venta específica.
  id (uuid, PK)
  venta_id (uuid, FK -> ventas.id)
  promocion_id (uuid, FK -> promociones.id)
  promocion_nombre (text)
  monto_descontado (numeric)

# venta_pagos

- Desglose de montos pagados por método en una misma venta (Pagos Mixtos).
  id (uuid, PK)
  venta_id (uuid, FK -> ventas.id)
  metodo_pago_id (uuid, FK -> metodos_pago.id)
  monto (numeric)
  comision (numeric)
  neto_estimado (numeric)

# turnos_caja

- Apertura y cierre diario o por empleado.
  id (uuid, PK)
  usuario_id (uuid, FK -> perfiles.id)
  fecha_apertura (timestamp)
  fecha_cierre (timestamp, nullable)
  monto_inicial (numeric)
  monto_final (numeric, nullable)
  estado (text)

# egresos

- Retiros de dinero (pagos a proveedores, gastos diarios).
  id (uuid, PK)
  concepto (text)
  monto (integer)
  fecha (timestamptz)
  creado_por (uuid, FK -> perfiles.id, nullable)

### 🎁 Módulo de Promociones y Configuración

# promociones

Reglas centrales de descuento.
id (uuid, PK)
nombre (text)
tipo_regla (text)
tipo_descuento (text)
valor_descuento (numeric)
monto_minimo (numeric)
fecha_inicio (timestamp, nullable)
fecha_fin (timestamp, nullable)
activa (boolean)
creado_por (uuid, FK -> perfiles.id)

# promociones_metodos_pago y promociones_categorias

Tablas pivote para asociar promociones a métodos o categorías.

# metodos_pago

- Métodos habilitados para el POS.
  id (uuid, PK)
  nombre (text)
  tipo (text)
  comision (numeric, default: 0)
  acreditacion_dias (integer, default: 0)
  activo (boolean, default: true)
  creado_en (timestamptz)

# configuracion_pos

- Ajustes globales del comercio (Singleton).
  id (uuid, PK)
  posName (text, default: 'System POS')
  whatsapp (text)
  direccion (text, nullable)
  mensaje_ticket (text, nullable, default: '¡Gracias por su compra!')
  posLogo (text, nullable)
  updated_at (timestamptz)
  Toggles: catalogo_activo, mostrar_precios, mostrar_sin_stock, pedidos_whatsapp, direccion_visible, horario_visible, banner_activo, marquee_activo (boolean, default variables)
  Redes: instagram, facebook (text)
  Textos UI: horario_texto, marquee_texto (text)
  Banner: banner_imagen, banner_titulo, banner_subtitulo, banner_boton_texto, banner_link (text)

### 👥 Módulo de Usuarios

# perfiles

- Usuarios del sistema y control de acceso.
  id (uuid, PK): Coincide con auth.users.id.
  nombre (text)
  email (text)
  rol (text, default: 'VENDEDOR')
  creado_en (timestamptz)

### 📥 Módulo de Compras (Proveedores y Conciliaciones)

# ordenes_compra

- Remitos y pedidos de mercadería.
  id (uuid, PK)
  proveedor (text)
  fecha_remito (date, nullable)
  total_presupuestado (numeric, default: 0)
  estado (text, default: 'PENDIENTE')
  creado_en (timestamptz)

# ordenes_items

- Detalle de la mercadería solicitada/recibida.
  id (uuid, PK)
  orden_id (uuid, FK -> ordenes_compra.id, nullable)
  raw_nombre (text): Nombre original del proveedor.
  raw_variante (text): Variante original del proveedor.
  cantidad (integer, default: 0)
  precio_costo (numeric, default: 0)
  estado_match (text, default: 'PENDIENTE'): Estado de la conciliación.
  producto_id (uuid, FK -> productos.id, nullable): Match con sistema local.
  variante_match (text, nullable): Match de variante local.

# diccionario_alias

- Memoria del sistema para autocompletar conciliaciones futuras.
  id (uuid, PK)
  proveedor (text)
  raw_nombre (text)
  producto_id (uuid, FK -> productos.id, nullable)
  creado_en (timestamptz)