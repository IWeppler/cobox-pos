# 📦 Sistema POS & Catálogo E-commerce (Multirrubro)

Un sistema integral de Punto de Venta (POS), gestión empresarial y catálogo web público. Construido con **Next.js, Supabase y Tailwind CSS**. Gracias a su arquitectura de base de datos basada en JSONB, es altamente flexible y se adapta a cualquier rubro minorista (indumentaria, viveros, tecnología, almacenes, etc.).

## ✨ Características Principales

### 🏪 Para los Clientes (Catálogo Web)

- **Catálogo Dinámico:** Visualización de productos por categorías con atributos configurables (talles, colores, materiales, peso, etc.).
- **Carrito de Compras Optimizados:** Sistema rápido con persistencia local y cálculo de descuentos.
- **Integración con WhatsApp:** Checkout sin fricción que genera un mensaje pre-armado hacia el WhatsApp del local con el detalle exacto del pedido.

### 💼 Para el Local (Terminal POS & ERP)

- **Terminal POS Súper Rápida:** Interfaz táctil de mostrador (Quick Add) que descuenta inventario en tiempo real. Soporte para múltiples métodos de pago (Mixtos) y calculadora de vuelto.
- **Inventario Dinámico (JSONB):** Creación de productos simples o con variantes ilimitadas. Cálculo automático de costos, precios y márgenes de rentabilidad.
- **Módulo de Caja y Finanzas (Multi-caja):**
  - Apertura y cierre de turnos (Tickets Z).
  - Dashboard en tiempo real (Ingresos Brutos - Costos - Egresos = Ganancia Neta).
  - Arqueo ciego para control estricto de los vendedores.
- **CRM y Cuentas Corrientes:**
  - Ficha detallada por cliente con historial de compras (Contado y Crédito).
  - Gestión de saldos, pagos parciales a cuenta y reglas de recargo/pago mínimo configurables por cliente.
- **Gestión de Bajas / Mermas:** Registro de roturas, robos o vencimientos para métricas precisas de pérdida de capital.
- **Gestión de Usuarios y Permisos Granulares:** Sistema de Roles personalizable (Admin, Cajero, Vendedor, etc.) con restricciones específicas (ej: ocultar costos o rentabilidad al staff).
- **Marca Blanca (Configuración):** Panel para modificar dinámicamente el nombre del local, logos, números de contacto y opciones de visualización sin tocar el código.

## 🛠️ Stack Tecnológico

- **Framework:** Next.js (App Router, Server Actions, React)
- **Base de Datos & Auth:** Supabase (PostgreSQL, Row Level Security, JSONB, Storage)
- **Estilos:** Tailwind CSS
- **Componentes UI:** Shadcn UI / Radix Primitives
- **Gestión de Estado (Client):** Zustand
- **Iconos:** Lucide React
- **Notificaciones:** Sonner

🚀 Instalación y Configuración Local

1. Clonar el repositorio
   git clone [https://github.com/tu-usuario/vivero-tostado.git](https://github.com/tu-usuario/vivero-tostado.git)
   cd vivero-tostado

2. Instalar dependencias
   npm install

# o yarn install / pnpm install

3. Variables de Entorno
   Crea un archivo .env.local en la raíz del proyecto y agrega tus credenciales de Supabase:
   NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key

4. Ejecutar en entorno de desarrollo
   npm run dev

La aplicación estará disponible en http://localhost:3000.
🗄️ Estructura de la Base de Datos (Supabase)
El proyecto requiere las siguientes tablas en PostgreSQL:
productos: Información base (nombre, tipo, precio, costo, imagen, publicado).
productos_stock: Control de cantidad vinculada a una variante (Ej: Talle N12) por cada producto.
ventas: Registro de transacciones con vendedor_id para trazabilidad.
perfiles: Vinculada al sistema de auth.users. Define el rol (ADMIN o VENDEDOR).
bajas: Solicitudes de baja de inventario con estado (PENDIENTE, APROBADA, RECHAZADA).
egresos: Registro de gastos operativos para el cálculo de caja.
configuracion_pos: Tabla de una sola fila para persistir el branding (Logo, WhatsApp, etc.).
(Asegurarse de tener configuradas correctamente las políticas de Row Level Security - RLS para que los vendedores solo tengan permisos de lectura en catálogos y escritura en ventas).
📂 Arquitectura de Carpetas
El proyecto sigue una arquitectura modular basada en Features (Funcionalidades):
├── app/
│ ├── (dashboard)/ # Rutas privadas del POS (Admin & Vendedores)
│ ├── (public)/ # Rutas públicas (Catálogo para clientes)
│ ├── auth/ # Pantallas de Login/Registro
│ └── layout.tsx # Layout principal
├── entities/ # Tipos globales e interfaces de TypeScript
├── features/ # Funcionalidades encapsuladas
│ ├── auth/ # Server Actions de sesión
│ ├── caja/ # Lógica y UI del módulo financiero
│ ├── configuracion/ # Formularios de branding del POS
│ ├── productos/ # Acciones y vistas del catálogo público
│ ├── purchases/ # Importación de pedidos/remitos
│ ├── sales/ # Registro de ventas, tablas y acciones
│ └── stock/ # Inventario, edición, bajas y modales
└── shared/
├── components/ # Componentes reutilizables (Navbar, Sidebar, etc.)
├── config/ # Configuración de clientes (Supabase)
├── store/ # Zustand stores (Ej: Carrito)
├── ui/ # Componentes base de diseño (Botones, Inputs - Shadcn)
└── utils/ # Helpers (formateo de moneda, slugs)

🛡️ Seguridad y Middleware
El proyecto utiliza un middleware.ts en Next.js para proteger las rutas.
Si un usuario no autenticado intenta acceder a /stock, es redirigido a /store (o /auth).
Si un usuario con rol VENDEDOR intenta acceder a / (Dashboard Financiero), /configuracion o /caja, es redirigido forzosamente a /stock.

👨‍💻 Autor
Desarrollado por Ignacio Weppler para la gestión optimizada de emprendimientosy pequeños y medianos negocios.