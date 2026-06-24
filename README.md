🌿 Sistema POS & Catálogo
Un sistema integral de Punto de Venta (POS) y catálogo web público diseñado específicamente para viveros y tiendas de plantas. Construido con Next.js, Supabase y Tailwind CSS, ofrece una gestión completa de inventario, control de caja, trazabilidad de ventas por vendedor y un flujo de pedidos a través de WhatsApp.
✨ Características Principales
🏪 Para los Clientes (Catálogo Web)
Catálogo Interactivo: Visualización de plantas por categorías, con imágenes, precios y variantes (talles de macetas).
Carrito de Compras: Sistema rápido para agregar productos con persistencia local.
Integración con WhatsApp: Al finalizar la compra, se genera automáticamente un mensaje pre-armado hacia el WhatsApp del local con el detalle exacto del pedido y el total a pagar.
💼 Para el Local (Dashboard POS)
Sistema Multi-Rol:
ADMIN: Acceso total (Dashboard financiero, métricas, edición de stock, configuración, arqueo de caja).
VENDEDOR: Acceso limitado (Solo lectura de stock, venta rápida, registro de bajas y listado de sus ventas del día).
Gestión de Inventario (/stock): Control de productos por variantes (M8, N12, 3L, etc.). Cálculo automático de margen de ganancia (Precio - Costo).
Venta Rápida POS: Sistema de carrito interno para el mostrador. Descuenta automáticamente el stock de la base de datos al confirmar la venta y registra qué vendedor la realizó.
Módulo de Caja y Finanzas (/caja):
Dashboard en tiempo real con cálculos de: Ingresos Brutos - Costo de Mercadería - Egresos = Ganancia Neta.
Registro de gastos operativos (egresos) como fletes o insumos.
Filtros dinámicos (Hoy, Este Mes, Este Año).
Gestión de Bajas (/stock/bajas): Los vendedores pueden reportar plantas secas, roturas o plagas. El Administrador debe aprobarlas para que se descuenten del inventario físico, generando métricas de pérdidas.
Personalización (/configuracion): Interfaz para modificar dinámicamente el nombre del local, logo, número de WhatsApp y dirección sin tocar el código.
🛠️ Stack Tecnológico
Framework: Next.js (App Router, Server Actions, React)
Base de Datos & Auth: Supabase (PostgreSQL, Row Level Security, Storage para imágenes)
Estilos: Tailwind CSS
Componentes UI: Shadcn UI / Radix Primitives
Gestión de Estado (Carrito): Zustand
Iconos: Lucide React
Notificaciones: Sonner (Toasts)
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
Desarrollado por Ignacio Weppler para la gestión optimizada de Vivero Tostado.