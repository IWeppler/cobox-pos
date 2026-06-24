Los items que tienen ## al principio significa que ya estan hechos
Los items que tienen ### al principio significa que estoy trabajando

REPORTE POR CANAL DE VENTAS: Instagram, local, POS

# ✅ Core implementado

## 1 - Apertura y Cierre de Caja: Control de turnos. "El empleado Juan abrió la caja con $10.000 y la cerró con $45.000". Fundamental para la paz mental del dueño.

## 2 - Ventas sin Fricción: Permitir ventas con stock negativo (mostrando una ⚠️ alerta visual). La realidad física manda; nunca bloquees una venta.

## 3 - Métodos de Pago Base: Implementar un selector al cobrar: Efectivo (por defecto), Tarjeta, Transferencia/App.

## 4 - Pantalla de "Venta Realizada": El modal de éxito final con el botón estrella: "Enviar Comprobante por WhatsApp". Tu motor oculto de marketing.

## 5 - Detalle y Ganancia: La pantalla de resumen de cada venta que le muestre al dueño exactamente cuánta ganancia neta le dejó esa operación específica.

## 6 - Devoluciones Simples: Un botón de "Registrar Devolución" con motivo, preguntando si el stock y el dinero vuelven a sus lugares. Nada de "Notas de Crédito" complejas aún.

## 7 - Descuentos Comerciales: Botón en el carrito para aplicar descuento por % o monto fijo. Ideal para el marketing cruzado que planeaste.

## 8 - Insights y Gráficos: Evolución de ventas y horarios pico, pero traducidos a lenguaje humano. Tarjetas con 💡 consejos (ej: "Asegura cambio a las 18hs, es tu pico de ventas"). Mantener el ranking de Mayor Rotación.

# Improves:

## mejorar ui carrito de venta

## modificacion de precios masivos

## boton de descargar pwa

## ticket en formato pdf

## dark/light mode

## mejorar el dashboard inicial y mejorar el modulo de reportes/metricas

## El modulo de reportes: quiero traer por fechas el Flujo de Ingresos Diarios; Ventas por Categoría no me trae correctamente las funciones; Rentabilidad por Categoría tiene el mismo problema ademas el chart no se ve bien.

## modulo de reportes: margen operativo estimado en porcentaje, falta ver el monto en $ asociado.

## Ingresos Brutos vs Ganancia Bruta: micro-copy. Total vendido antes de costos y gastos. y Ingresos menos costo de mercadería.

## Reportes / Ventas: Agregaría ventas por día/hora.

## Ventas por categoría debería tener selector de métrica: [Ingresos] [Unidades] [Tickets]

## Reportes/Inventario: Agregaría “valor potencial de venta”

## Además de capital inmovilizado al costo, sería útil mostrar: Valor al costo: $X; Valor potencial de venta: $Y; Ganancia potencial: $Z

## Productos sin movimiento: definir ventana: hace 30 días - hace 60 días - hace 90 días

## en el modulo de stock debo poder ordenar en la tabla por nombre (a-z), mas/menos stock (ej: -5, 1000), orden mayor/menor costo, orden mayor/menor precio venta, y filtro stock-bajo (solo con stock ej: 0 o -10).

## Relación bajas/ingresos: Muy buen KPI: Bajas sobre ingresos: 2.4%. Porque $20.000 en bajas puede ser mucho o poco según cuánto vendiste.

# 🐛 Bugs / Correcciones necesarias

## Reportes: Ventas por categoría no calcula correctamente.

## Reportes: Rentabilidad por categoría no calcula correctamente.

## Reportes: chart de rentabilidad por categoría no se ve bien.

## Revisar obtención de datos por rango de fechas.

## Revisar consistencia entre ingresos, ganancia, caja y descuentos.

### Features para terminar el MVP:
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

-- 9. Revisar y corregir UX/UI para mobile. fundamental.
-- 12. mejorar flujo del boton de registrar venta y registrar venta en general
-- mejorar la vista en grilla
-- mejorar el envio de comprobante
-- con cuanto paga tu cliente? 

creacion de un producto
-- producto basico, producto con variantes, producto con medidas
-- se deberia poder crear una categoria si no tengo creada... Debe haber una opcion si queremos que la categoria se muestre en la tienda/catalogo
-- no deberia aparecer si es visible o no.
-- impuestos como dropdown

✅ 13. En el catalogo hay que mejorar el flujo de variantes de un producto. actualmente aparecen [blanco/M] [Blanco/L] [Negro/M] [Negro/L] y quiero que aparezca [Blanco] [Negro] / [M] [L]
✅ 14. Corregir buscador de catalogo: en el navbar tengo un el searchbar para buscar productos que es como una especie de filtro que actua instantaneamente en el catalogo, pero preferiria que en realidad simplemente busque y me aparezca abajo los resultados, ademas que se pueda buscar por productos o categorias.
✅ 15. Corregir marquee de catalogo: actualmente no se esta moviendo y necesito que se empiece a mover..
✅ 16. Corregir CTA de banner en catalogo: hay que chequear bien como funciona, porque actualmente parece que tiene la redireccion a # y en realidad deberia redirigir dependiendo la campaña o configuracion hacia una categoria de plantas o producto en particular o nose...
✅ 17. corregir categorias de catalogo: actualmente aparecen todas juntas en minusculas y no como estan configuradas en el panel de administracion o aparecen en la base de datos..
✅ 18. Corregir carrito del POS catalogo, 19. mejorar zustand carrito para clientes en catalogo: parece que son dos problemas que van de la mano hace un rato me aparecia como el carrito del pos y no para enviar pedido.

-- coordenadas o directamente a redirección del local para que en el catalogo un usuario pueda hacer click y que lo redirija a google maps
# Fix Bug:

✅ 10. Advisor-Banner: aparece todo el tiempo. Deberia aparecer una vez al dia.
✅ 11. El light/dark mode no funciona correctamente, falta un zustand o algo que persevere.

# Admin:

✅ 6. Estandarización Dinámica: Mover Categorías y Variantes (talles, colores) a la base de datos para que cada negocio cree las suyas propias.

-- 8. Separacion de modulos: 
Plan 1 — Emprendedor:
Plan 2 — Gestión / Profesional:
Plan 3 — Empresa / Multi-sucursal:

-- Postergado. Presupuestos y Órdenes: Estados de venta (Cobrado, Presupuesto, A Confirmar). Clave para oficios o ventas grandes.
-- Postergado. Módulo CRM Opcional: Si el negocio lo desea, puede pedir Nombre y WhatsApp al cobrar para ir armando su propia base de datos de clientes. cliente, venta fiada, saldo pendiente, pago posterior, historial de deuda
Flujo mínimo que deberías implementar

1. Crear cliente rápido al cobrar
   En el cart-sheet: Cliente: [Consumidor final ▼]
   Opciones: Consumidor final, Buscar cliente, Crear cliente
   Campos mínimos para crear: Nombre, WhatsApp, Nota opcional

2. Método de pago “Cuenta corriente”
   En el checkout: Método de pago: Efectivo, Transferencia, Tarjeta, Cuenta corriente, Pago mixto
   Si elige cuenta corriente, obligás cliente:Para vender a cuenta corriente, seleccioná un cliente.
   Regla clave: No puede haber deuda sin cliente.

3. Pago parcial.Esto es fundamental.
   Ejemplo:Total venta: $100.000; Paga ahora: $30.000 efectivo; Queda pendiente: $70.000
   El sistema debería guardar: Venta total: $100.000; Cobrado: $30.000; Pendiente: $70.000; Estado: Parcial

4. Cobranza posterior
   En ficha del cliente: Saldo pendiente: $70.000 [Registrar pago]
   Al registrar pago: Monto: $30.000; Método: Transferencia; Nota: Pago parcial
   Nuevo saldo: $40.000 pendiente. Y si paga todo: Estado: Pagada
   Estados: Pagada, Parcial, Pendiente, Anulada

5. Lo más importante: separar vendido, cobrado y pendiente
   Esto te cambia el sistema.
   Hasta ahora probablemente pensás: venta = ingreso

   Pero con cuenta corriente ya no. Tenés que distinguir:

Vendido = total de ventas generadas
Cobrado = plata que realmente entró
Pendiente = plata en la calle
Ganancia generada = rentabilidad de la venta
Ganancia cobrada = parte efectivamente cobrada, si querés ser más fino

Ejemplo:
Vendiste: $500.000
Cobraste: $350.000
Pendiente: $150.000

Impacto en Caja: Una venta fiada no puede entrar completa a caja. Ejemplo:
Venta: $100.000
Pago inicial: $20.000 efectivo
Pendiente: $80.000

Caja debería registrar:
Ingreso efectivo: $20.000
No: Ingreso efectivo: $100.000

Y reportes comerciales sí pueden mostrar:
Ventas brutas: $100.000
Pendiente de cobro: $80.000

Esta separación es clave para que el sistema sea confiable.

6. Base de datos mínima

clientes
clientes (
id uuid primary key default gen_random_uuid(),
nombre text not null,
whatsapp text,
notas text,
activo boolean default true,
creado_en timestamptz default now(),
actualizado_en timestamptz default now()
);

7. En ventas
   Agregar:
   cliente_id uuid null references clientes(id),
   estado_pago text not null default 'PAGADA',
   total numeric(12,2) not null,
   monto_cobrado numeric(12,2) not null default 0,
   monto_pendiente numeric(12,2) not null default 0

Estados:
PAGADA
PARCIAL
PENDIENTE
ANULADA
venta_pagos

Esto te sirve tanto para método mixto como para cuenta corriente.
venta_pagos (
id uuid primary key default gen_random_uuid(),
venta_id uuid not null references ventas(id),
cliente_id uuid null references clientes(id),
metodo_pago_id uuid null,
monto_bruto numeric(12,2) not null,
comision_estimada numeric(12,2) default 0,
monto_neto numeric(12,2) not null,
tipo text not null,
creado_en timestamptz default now(),
creado_por uuid
);

Tipos:
PAGO_VENTA
PAGO_CUENTA_CORRIENTE
cuenta_corriente_movimientos

8. Esta es la tabla más importante para auditar deuda.
   cuenta_corriente_movimientos (
   id uuid primary key default gen_random_uuid(),
   cliente_id uuid not null references clientes(id),
   venta_id uuid null references ventas(id),
   pago_id uuid null references venta_pagos(id),

tipo text not null,
monto numeric(12,2) not null,
descripcion text,
creado_en timestamptz default now(),
creado_por uuid
);

Tipos:
DEBITO -- aumenta deuda
CREDITO -- reduce deuda

Saldo:sum(DEBITO) - sum(CREDITO)

Podés calcularlo al vuelo o guardar saldo cacheado en clientes.saldo_pendiente.
Para V1, yo guardaría ambos:
movimientos para auditoría
saldo_pendiente en clientes para performance
Pero asegurate de actualizarlo siempre de forma controlada.

9. Tabla de clientes
   Columnas:
   Cliente | WhatsApp | Total comprado | Saldo pendiente | Última compra | Acciones (Ver, Registrar pago, WhatsApp)

10. Detalle de cliente
    Cards: Saldo pendiente, Total comprado, Cantidad de compras, Última compra

Tabs:Cuenta corriente, Compras, Datos, Notas

Cuenta corriente:
Fecha | Concepto | Debe | Haber | Saldo

11. En el dashboard inicial. Una card pequeña:
    Dinero pendiente
    $150.000
    5 clientes con deuda
    Y un botón: Ver cuentas corrientes

12. En reportes. Más adelante agregaría una tab o sección: Cobros
    Total vendido; Total cobrado; Total pendiente; Clientes con mayor deuda; Deudas más antiguas; Cobros del período

# Modulo de Reportes:

-- Postergado. Exportar datos:ventas; inventario; clientes; caja; reportes
-- Postergado. conectar promociones con modulo de reportes. total descontado,promoción más usada, ventas con promoción, impacto en margen, descuento promedio

////////////////////////////////////////////////////////////////////////////////////////////////////////

### Épica 6 — Estandarización dinámica de categorías y variantes

Objetivo: Permitir que cada negocio pueda crear y administrar sus propias categorías, subcategorías, atributos y variantes de producto, sin depender de valores hardcodeados en el código.

Ejemplos:
Vivero:
Categorías: Interior, Exterior, Sustratos, Macetas
Atributos: Medida, Presentación
Valores: N12, N14, M8, 5DM3, 25DM3

Indumentaria:
Categorías: Hombre > Remeras, Mujer > Camperas, Niños > Calzado
Atributos: Talle, Color
Valores: S, M, L, XL, Negro, Blanco, Azul

Zapatería:
Categorías: Hombre > Zapatillas, Mujer > Sandalias
Atributos: Número, Color
Valores: 38, 39, 40, 41, Negro, Blanco

Decisión de modelo
La lógica correcta es esta:

Categorías = organización del catálogo.
Atributos = características configurables.
Valores = opciones de cada atributo.
Variantes = combinaciones vendibles reales de un producto.

Ejemplo:

Producto: Remera Básica
Categoría: Hombre > Remeras

Atributos aplicables:

- Talle
- Color

Valores seleccionados:

- Talle: S, M, L
- Color: Negro, Blanco

Variantes generadas:

- S / Negro
- M / Negro
- L / Negro
- S / Blanco
- M / Blanco
- L / Blanco

La venta siempre debería descontar stock de una variante concreta, no de un producto genérico.

Alcance de la épica
Incluye
Categorías dinámicas
Subcategorías
Atributos dinámicos
Valores de atributos
Relación categoría-atributos
Variantes por producto
Migración desde categorías/variantes hardcodeadas
UI de configuración
Adaptación de inventario, store, filtros, ventas y reportes

# Task 1 — Crear tabla categorias

Objetivo: Mover las categorías hardcodeadas a base de datos y permitir que cada negocio cree las suyas.

Tabla sugerida
create table categorias (
id uuid primary key default gen_random_uuid(),

nombre text not null,
slug text not null,

parent_id uuid null references categorias(id) on delete cascade,

descripcion text,
imagen_url text,

orden int not null default 0,
activa boolean not null default true,

created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);
Permite
Interior
Exterior
Sustratos
Hombre > Remeras
Mujer > Camperas
Niños > Calzado
Criterios de aceptación
El negocio puede crear categorías.
El negocio puede crear subcategorías.
Las categorías se pueden activar/desactivar.
Las categorías tienen orden.
Los productos pueden asociarse a una categoría dinámica.

# Task 2 — Crear CRUD de categorías en Configuración

Ubicación recomendada
Configuración > Catálogo O Configuración > Categorías y atributos
Funcionalidades
Crear categoría
Editar categoría
Eliminar/desactivar categoría
Crear subcategoría
Ordenar categorías
Activar/desactivar categoría

Criterios de aceptación
Las categorías ya no dependen de constantes en el frontend.
El formulario de producto consume categorías desde Supabase.
El store público consume categorías desde Supabase.
Los filtros de inventario consumen categorías desde Supabase.

# Task 3 — Migrar categorías actuales

Objetivo

Tomar las categorías actuales hardcodeadas y crear registros en la tabla categorias.

Ejemplo actual:

Interior
Exterior
Suculentas
Aromáticas
Macetas
Sustratos

Se migran a:

categorias
Cuidado

Si hoy productos.tipo guarda un string como "Interior", tenés que migrarlo a:

productos.categoria_id
Script conceptual
alter table productos
add column categoria_id uuid null references categorias(id);

-- Crear categorías iniciales
-- Actualizar productos según productos.tipo
-- Mantener productos.tipo temporalmente si hace falta
Criterios de aceptación
Los productos existentes conservan su categoría.
El sistema funciona aunque productos.tipo quede deprecado.
La UI nueva usa categoria_id.
No se pierde información existente.

# Task 4 — Crear tabla atributos

Objetivo

Permitir que cada negocio defina qué atributos usan sus productos.

Ejemplos:

Talle
Color
Número
Medida
Presentación
Litros
Peso
Material
Tabla sugerida
create table atributos (
id uuid primary key default gen_random_uuid(),

nombre text not null,
slug text not null,

tipo text not null default 'TEXT',
orden int not null default 0,
activo boolean not null default true,

created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);
Tipos posibles

Para V1, con TEXT alcanza.

Más adelante:

TEXT
COLOR
NUMBER
SIZE
Criterios de aceptación
El admin puede crear atributos.
El admin puede editar atributos.
El admin puede activar/desactivar atributos.
Los atributos pertenecen a un negocio.

# Task 5 — Crear tabla atributo_valores

Objetivo: Permitir que cada atributo tenga valores configurables.

Ejemplos:
Talle: S, M, L, XL
Color: Negro, Blanco, Azul
Número: 38, 39, 40, 41
Medida: N12, N14, M8
Presentación: 5DM3, 25DM3

Tabla sugerida
create table atributo_valores (
id uuid primary key default gen_random_uuid(),

atributo_id uuid not null references atributos(id) on delete cascade,

valor text not null,
slug text not null,

color_hex text null,

orden int not null default 0,
activo boolean not null default true,

created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

color_hex sirve si el atributo es Color.

Ejemplo:

Negro → #000000
Rojo → #ef4444
Azul → #2563eb
Criterios de aceptación
El admin puede crear valores para cada atributo.
El admin puede ordenar valores.
El admin puede desactivar valores.
Los valores se usan luego para generar variantes.

# Task 6 — Crear CRUD de atributos y valores

Ubicación
Configuración > Catálogo > Atributos

Funcionalidades
Crear atributo
Editar atributo
Crear valores
Editar valores
Eliminar/desactivar valores
Ordenar valores

Criterios de aceptación
Ya no hay VARIANTE_OPTIONS hardcodeado.
Cada negocio puede crear sus propios atributos.
Cada negocio puede definir sus propios valores.

# Task 7 — Crear tabla categoria_atributos

Objetivo: Definir qué atributos aplican a cada categoría.

Ejemplo:
Hombre > Remeras:

- Talle
- Color

Zapatería > Zapatillas:

- Número
- Color

Vivero > Interior:

- Medida / Maceta

Vivero > Sustratos:

- Presentación

Tabla sugerida
create table categoria_atributos (
id uuid primary key default gen_random_uuid(),

categoria_id uuid not null references categorias(id) on delete cascade,
atributo_id uuid not null references atributos(id) on delete cascade,

requerido boolean not null default false,
orden int not null default 0,
created_at timestamptz not null default now(),
unique (categoria_id, atributo_id)
);

Criterios de aceptación
Cada categoría puede tener atributos sugeridos.
Al crear un producto, el sistema sabe qué atributos mostrar según su categoría.
Una categoría puede no tener atributos.
Una categoría puede tener uno o varios atributos.

# Task 8 — UI para asignar atributos a categorías

Ubicación
Dentro del editor de categoría:
Categoría: Hombre > Remeras

Atributos aplicables:
[x] Talle
[x] Color
[ ] Número
[ ] Medida

Criterios de aceptación
El admin puede definir atributos por categoría.
Al seleccionar una categoría en el formulario de producto, aparecen los atributos correspondientes.

# Task 9 — Crear tabla producto_variantes

Objetivo: Crear una entidad clara para la unidad vendible real.

Actualmente probablemente tenés algo como:
productos_stock

Ese concepto debería evolucionar hacia:
producto_variantes
Tabla sugerida
create table producto_variantes (
id uuid primary key default gen_random_uuid(),

producto_id uuid not null references productos(id) on delete cascade,

sku text,
nombre_display text,

precio numeric(12,2) not null default 0,
costo numeric(12,2) not null default 0,

stock numeric(12,2) not null default 0,
stock_minimo numeric(12,2) not null default 0,

activa boolean not null default true,

created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

Ejemplos de nombre_display
N12
M8
S / Negro
M / Blanco
42 / Azul
25DM3
Criterios de aceptación
Cada variante tiene stock.
Cada variante puede tener precio.
Cada variante puede tener costo.
Cada variante puede tener SKU.
La venta descuenta stock de una variante concreta.

# Task 10 — Crear tabla producto_variante_valores

Objetivo: Relacionar cada variante con los valores de atributos que la componen.

Tabla sugerida
create table producto_variante_valores (
id uuid primary key default gen_random_uuid(),

variante_id uuid not null references producto_variantes(id) on delete cascade,
atributo_id uuid not null references atributos(id),
atributo_valor_id uuid not null references atributo_valores(id),

unique (variante_id, atributo_id)
);

Ejemplo

Producto:
Remera Básica

Variante:
M / Negro

Registros:
Talle = M
Color = Negro

Producto:
Crisantemo

Variante:
Medida = N12

Criterios de aceptación
Una variante puede tener uno o más atributos.
No se puede repetir el mismo atributo dentro de la misma variante.
Se puede consultar stock por talle, color, medida, presentación, etc.

# Task 11 — Migrar productos_stock a producto_variantes

Objetivo

Migrar el modelo actual de stock/variante al nuevo modelo.

Si hoy tenés:
productos_stock

- producto_id
- variante
- cantidad
- precio
- costo

Migrar a:
producto_variantes

Estrategia
Opción segura. No borrar productos_stock inmediatamente.

1. Crear nuevas tablas.
2. Migrar datos actuales.
3. Actualizar frontend/backend para leer producto_variantes.
4. Validar ventas, stock, bajas y reportes.
5. Deprecar productos_stock.
6. Borrar productos_stock más adelante.
   Criterios de aceptación
   Los productos existentes conservan stock.
   Las variantes existentes se migran correctamente.
   Las ventas siguen descontando stock.
   Las bajas siguen funcionando.
   Los reportes siguen funcionando.

# Task 12 — Adaptar formulario de producto

Objetivo

El formulario de creación/edición de producto debe usar categorías y atributos dinámicos.

Flujo ideal

1. Admin elige categoría.
2. El sistema carga atributos asociados a esa categoría.
3. Admin selecciona valores de cada atributo.
4. Sistema genera variantes.
5. Admin completa stock, precio y costo por variante.
   Ejemplo indumentaria
   Categoría: Hombre > Remeras

Atributos:
Talle: S, M, L
Color: Negro, Blanco

Generar variantes:
S / Negro
M / Negro
L / Negro
S / Blanco
M / Blanco
L / Blanco
Ejemplo vivero
Categoría: Interior

Atributos:
Medida: N12, N14

Generar variantes:
N12
N14
Criterios de aceptación
El producto se crea con categoría dinámica.
El producto se crea con variantes dinámicas.
Cada variante tiene stock, precio y costo.
El admin puede eliminar/desactivar combinaciones que no existan.

# Task 13 — Generador de variantes

Objetivo:"Crear una función que genere combinaciones a partir de valores seleccionados.

Ejemplo
Input:

{
Talle: ["S", "M"],
Color: ["Negro", "Blanco"]
}

Output:
S / Negro
S / Blanco
M / Negro
M / Blanco

Helper sugerido
type AttributeSelection = {
atributoId: string;
atributoNombre: string;
valores: {
id: string;
valor: string;
}[];
};

function generateVariantCombinations(selections: AttributeSelection[]) {
// Devuelve combinaciones posibles
}
Criterios de aceptación
Genera combinaciones correctamente.
Soporta un solo atributo.
Soporta múltiples atributos.
Permite remover variantes antes de guardar.
No duplica variantes existentes al editar.

# Task 14 — Adaptar inventario

Objetivo: El inventario debe leer desde el nuevo modelo dinámico.

Cambios
Mostrar categoría dinámica.
Mostrar variantes dinámicas.
Filtrar por categoría.
Filtrar por atributo/valor.
Buscar por nombre, SKU o variante.
Vender una variante concreta.

Criterios de aceptación
Inventario muestra productos existentes.
Inventario muestra variantes dinámicas.
Venta rápida funciona con producto_variantes.
Filtros no dependen de arrays hardcodeados.

# Task 15 — Adaptar carrito y ventas

Objetivo: El carrito debe operar con variante_id.

Item de carrito
type CartItem = {
productoId: string;
varianteId: string;
nombreProducto: string;
nombreVariante: string;
cantidad: number;
precioUnitario: number;
costoUnitario: number;
};

Criterios de aceptación
El carrito agrega variantes concretas.
La venta guarda variante_id.
La venta guarda snapshot de nombre de producto y variante.
El stock se descuenta de producto_variantes.

# Task 16 — Adaptar bajas

Objetivo: Las bajas deben registrarse contra una variante concreta.

Cambios
bajas.variante_id

Además de:
producto_id
Criterios de aceptación
Se puede dar de baja una variante específica.
La baja descuenta stock de producto_variantes.
El historial muestra producto + variante.
Reportes de bajas siguen funcionando.

# Task 17 — Adaptar actualización masiva de precios

Objetivo: La modificación masiva de precios debe operar sobre variantes.

Alcances
Todos los productos
Por categoría
Por productos seleccionados
Por atributo/valor, más adelante
Criterios de aceptación
Actualiza precios de variantes.
Mantiene historial de precio viejo y nuevo.
Respeta categoría dinámica.
No depende de productos_stock.

# Task 18 — Adaptar promociones

Objetivo: Promociones deben funcionar con categorías y productos dinámicos.

Cambios
promociones_categorias debe apuntar a categorias.id.
promociones_productos debe apuntar a productos.id.
promociones_variantes

Criterios de aceptación
Promociones por categoría funcionan con categorías dinámicas.
Promociones por producto siguen funcionando.
El carrito evalúa promociones según categoria_id.

# Task 19 — Adaptar reportes

Objetivo: Reportes deben consumir la nueva estructura.

Reportes afectados
Ventas por categoría
Rentabilidad por categoría
Inventario
Mayor rotación
Productos sin movimiento
Stock crítico
Bajas por motivo/producto
Criterios de aceptación
Reportes agrupan por categorias dinámicas.
Reportes muestran variante cuando corresponde.
Stock físico se calcula desde producto_variantes.
Capital inmovilizado se calcula desde producto_variantes.

# Task 20 — Adaptar store público

Objetivo: El catálogo público debe mostrar categorías y variantes dinámicas.

Cambios
Mostrar categorías desde DB.
Mostrar subcategorías si existen.
Mostrar variantes del producto desde producto_variantes.
Filtros por categoría.
Mostrar productos visibles.
Criterios de aceptación
El catálogo no depende de categorías hardcodeadas.
Las categorías configuradas aparecen en la store.
Los productos muestran variantes reales.
El pedido por WhatsApp incluye variante correcta.

# Task 21 — Seeds / presets por rubro

Objetivo: Facilitar la configuración inicial según tipo de negocio.

Presets sugeridos
Vivero
Categorías:
Interior, Exterior, Sustratos, Macetas, Fertilizantes

Atributos:
Medida/Maceta: N9, N12, N14, N20, M8
Presentación: 5DM3, 25DM3, 1L, 3L
Indumentaria
Categorías:
Hombre > Remeras
Hombre > Pantalones
Mujer > Remeras
Mujer > Camperas
Niños > Calzado

Atributos:
Talle: XS, S, M, L, XL, XXL
Color: Negro, Blanco, Azul, Rojo
Zapatería
Categorías:
Hombre > Zapatillas
Mujer > Sandalias
Niños > Calzado

Atributos:
Número: 35, 36, 37, 38, 39, 40, 41, 42, 43, 44
Color: Negro, Blanco, Marrón
Criterios de aceptación
Al crear negocio, se puede elegir rubro.
El sistema precarga categorías y atributos.
El admin puede modificarlos después.

# Task 22 — Seguridad / RLS

Objetivo: Garantizar que cada negocio solo acceda a sus propias categorías, atributos y variantes.
En tablas hijas como atributo_valores, validar vía relación.

# Task 23 — Limpieza de constantes hardcodeadas

Objetivo: Eliminar o deprecar constantes como:

TIPO_OPTIONS
VARIANTE_OPTIONS

Cambios
Reemplazar imports por fetch desde Supabase.
Actualizar selectores.
Actualizar filtros.
Actualizar formularios.
Criterios de aceptación
No quedan categorías hardcodeadas en producción.
No quedan variantes hardcodeadas en producción.
Los valores vienen desde DB.
