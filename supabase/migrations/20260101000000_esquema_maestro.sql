
BEGIN;

-- 1. TABLAS BASE
CREATE TABLE public.categorias (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_id uuid,
    nombre text NOT NULL,
    slug text NOT NULL,
    descripcion text,
    imagen_url text,
    orden integer NOT NULL DEFAULT 0,
    activa boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.productos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria_id uuid REFERENCES public.categorias(id),
    nombre text NOT NULL,
    slug text,
    descripcion text,
    tipo text DEFAULT 'Interior'::text,
    cuidados text DEFAULT 'Luz indirecta'::text,
    imagen_url text,
    precio numeric NOT NULL DEFAULT 0,
    precio_costo numeric NOT NULL DEFAULT 0,
    atributos_globales jsonb DEFAULT '{}'::jsonb,
    publicado boolean DEFAULT true,
    creado_en timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.producto_variantes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    sku text,
    nombre_display text NOT NULL,
    atributos jsonb DEFAULT '{}'::jsonb,
    precio numeric,
    costo numeric,
    stock integer NOT NULL DEFAULT 0,
    stock_minimo integer NOT NULL DEFAULT 0,
    activa boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- (Legacy support)
CREATE TABLE public.productos_stock (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
    variante text NOT NULL,
    cantidad integer NOT NULL DEFAULT 0
);

-- 2. CLIENTES Y CRM
CREATE TABLE public.clientes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text NOT NULL,
    dni text,
    email text,
    telefono text NOT NULL,
    notas text,
    reglas_credito jsonb DEFAULT '{}'::jsonb,
    saldo_pendiente numeric NOT NULL DEFAULT 0,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. CAJA Y FINANZAS
CREATE TABLE public.metodos_pago (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text NOT NULL,
    tipo text NOT NULL,
    comision numeric NOT NULL DEFAULT 0,
    acreditacion_dias integer NOT NULL DEFAULT 0,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.turnos_caja (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    modo text NOT NULL DEFAULT 'UNICA'::text,
    estado text NOT NULL DEFAULT 'ABIERTO'::text,
    monto_inicial numeric NOT NULL DEFAULT 0,
    efectivo_esperado numeric,
    monto_final numeric,
    monto_declarado numeric,
    diferencia numeric,
    vendedor_id uuid NOT NULL,
    usuario_id uuid,
    abierta_por uuid,
    cerrada_por uuid,
    punto_venta_id uuid,
    observaciones text,
    observacion_apertura text,
    observacion_cierre text,
    fecha_apertura timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    fecha_cierre timestamp with time zone
);

CREATE TABLE public.ventas (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    turno_caja_id uuid REFERENCES public.turnos_caja(id),
    cliente_id uuid REFERENCES public.clientes(id),
    vendedor_id uuid,
    estado_operacion text NOT NULL DEFAULT 'CONFIRMADA'::text,
    estado_pago text NOT NULL DEFAULT 'PAGADA'::text,
    metodo_pago text NOT NULL DEFAULT 'EFECTIVO'::text,
    es_pago_mixto boolean DEFAULT false,
    cantidad integer NOT NULL DEFAULT 1,
    precio_costo numeric NOT NULL DEFAULT 0,
    total_bruto numeric,
    comision_total numeric DEFAULT 0,
    total_neto numeric,
    total numeric NOT NULL DEFAULT 0,
    monto_cobrado numeric NOT NULL DEFAULT 0,
    monto_pendiente numeric NOT NULL DEFAULT 0,
    fecha_venta timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.ventas_items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES public.productos(id),
    variante text NOT NULL,
    cantidad integer NOT NULL,
    precio_costo numeric NOT NULL DEFAULT 0,
    precio_unitario numeric NOT NULL,
    descuento_monto numeric DEFAULT 0,
    precio_final numeric,
    promocion_id uuid,
    promocion_nombre text
);

CREATE TABLE public.venta_pagos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    venta_id uuid REFERENCES public.ventas(id) ON DELETE CASCADE,
    turno_caja_id uuid REFERENCES public.turnos_caja(id),
    cliente_id uuid REFERENCES public.clientes(id),
    metodo_pago_id uuid REFERENCES public.metodos_pago(id),
    metodo_nombre text NOT NULL,
    metodo_tipo text NOT NULL,
    tipo_movimiento text NOT NULL DEFAULT 'PAGO_VENTA'::text,
    estado_pago_operacion text NOT NULL DEFAULT 'CONFIRMADO'::text,
    monto_bruto numeric NOT NULL,
    comision_porcentaje numeric NOT NULL DEFAULT 0,
    comision_monto numeric NOT NULL DEFAULT 0,
    monto_neto numeric NOT NULL,
    acreditacion_dias integer NOT NULL DEFAULT 0,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.cuenta_corriente_movimientos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    venta_id uuid REFERENCES public.ventas(id),
    pago_id uuid REFERENCES public.venta_pagos(id),
    tipo text NOT NULL,
    monto numeric NOT NULL,
    descripcion text,
    creado_por uuid,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.egresos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    concepto text NOT NULL,
    monto integer NOT NULL,
    creado_por uuid,
    fecha timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. PROMOCIONES Y REGLAS
CREATE TABLE public.promociones (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text,
    tipo_regla text NOT NULL,
    tipo_descuento text NOT NULL,
    valor_descuento numeric NOT NULL,
    monto_minimo numeric DEFAULT 0,
    limite_usos integer,
    usos_actuales integer DEFAULT 0,
    activa boolean NOT NULL DEFAULT true,
    acumulable boolean NOT NULL DEFAULT false,
    prioridad integer NOT NULL DEFAULT 0,
    creado_por uuid,
    fecha_inicio timestamp with time zone,
    fecha_fin timestamp with time zone,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.promociones_categorias (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    promocion_id uuid NOT NULL REFERENCES public.promociones(id) ON DELETE CASCADE,
    categoria_nombre text NOT NULL
);

CREATE TABLE public.promociones_metodos_pago (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    promocion_id uuid NOT NULL REFERENCES public.promociones(id) ON DELETE CASCADE,
    metodo_pago text NOT NULL
);

CREATE TABLE public.promociones_productos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    promocion_id uuid NOT NULL REFERENCES public.promociones(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE
);

CREATE TABLE public.ventas_descuentos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    promocion_id uuid REFERENCES public.promociones(id),
    promocion_nombre text NOT NULL,
    tipo_descuento text NOT NULL,
    monto_descontado numeric NOT NULL,
    aplicado_en timestamp with time zone NOT NULL DEFAULT now()
);

-- 5. COMPRAS Y CONCILIACIÓN
CREATE TABLE public.ordenes_compra (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    proveedor text NOT NULL,
    estado text DEFAULT 'PENDIENTE'::text,
    total_presupuestado numeric NOT NULL DEFAULT 0,
    fecha_remito date,
    creado_en timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.ordenes_items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    orden_id uuid REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES public.productos(id),
    raw_nombre text NOT NULL,
    raw_variante text NOT NULL,
    raw_categoria text,
    estado_match text DEFAULT 'PENDIENTE'::text,
    variante_match text,
    cantidad integer NOT NULL DEFAULT 0,
    precio_costo numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.diccionario_alias (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
    proveedor text NOT NULL,
    raw_nombre text NOT NULL,
    creado_en timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.actualizaciones_precio (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text,
    tipo_alcance text NOT NULL,
    tipo_operacion text NOT NULL,
    campo_objetivo text NOT NULL,
    valor numeric NOT NULL,
    redondeo text,
    cantidad_afectada integer NOT NULL DEFAULT 0,
    estado text NOT NULL DEFAULT 'APLICADO'::text,
    creado_por uuid,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.actualizaciones_precio_items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    lote_id uuid NOT NULL REFERENCES public.actualizaciones_precio(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    costo_anterior numeric NOT NULL DEFAULT 0,
    costo_nuevo numeric NOT NULL DEFAULT 0,
    precio_anterior numeric NOT NULL DEFAULT 0,
    precio_nuevo numeric NOT NULL DEFAULT 0,
    creado_en timestamp with time zone NOT NULL DEFAULT now()
);

-- 6. CONFIGURACIÓN DEL SISTEMA
CREATE TABLE public.configuracion_pos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    posName text NOT NULL DEFAULT 'Vivero Tostado'::text,
    posLogo text,
    direccion text DEFAULT ''::text,
    whatsapp text NOT NULL,
    facebook text DEFAULT ''::text,
    instagram text DEFAULT ''::text,
    horario_texto text DEFAULT ''::text,
    mensaje_ticket text DEFAULT '¡Gracias por su compra!'::text,
    
    catalogo_activo boolean DEFAULT true,
    mostrar_precios boolean DEFAULT true,
    mostrar_sin_stock boolean DEFAULT false,
    pedidos_whatsapp boolean DEFAULT true,
    direccion_visible boolean DEFAULT true,
    horario_visible boolean DEFAULT true,
    
    banner_activo boolean DEFAULT false,
    banner_titulo text DEFAULT ''::text,
    banner_subtitulo text DEFAULT ''::text,
    banner_imagen text DEFAULT ''::text,
    banner_link text DEFAULT ''::text,
    banner_boton_texto text DEFAULT ''::text,
    
    marquee_activo boolean DEFAULT false,
    marquee_texto text DEFAULT '🚀 3 CUOTAS SIN INTERÉS // ENVÍO GRATIS COMPRANDO +$50.000 // 15% OFF EN EFECTIVO 🚀'::text,
    
    modo_caja text NOT NULL DEFAULT 'UNICA'::text,
    requiere_caja_abierta boolean NOT NULL DEFAULT true,
    
    cc_activas boolean DEFAULT true,
    cc_recargo_default numeric DEFAULT 0,
    cc_anticipo_default numeric DEFAULT 0,
    cc_limite_default numeric DEFAULT 0,
    cc_plazo_mora integer DEFAULT 30,
    
    crm_dias_inactivo integer DEFAULT 60,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.bajas (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid NOT NULL REFERENCES public.productos(id),
    variante text NOT NULL,
    cantidad integer NOT NULL,
    motivo text NOT NULL,
    estado text NOT NULL DEFAULT 'PENDIENTE'::text,
    creado_por uuid,
    creado_en timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.perfiles (
    id uuid NOT NULL PRIMARY KEY,
    nombre text NOT NULL,
    email text NOT NULL,
    rol text NOT NULL DEFAULT 'VENDEDOR'::text,
    creado_en timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Atributos V2 (Opcional si decides usarlos para el Catálogo más adelante)
CREATE TABLE public.atributos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text NOT NULL,
    slug text NOT NULL,
    tipo text NOT NULL DEFAULT 'TEXT'::text,
    orden integer NOT NULL DEFAULT 0,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.atributo_valores (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    atributo_id uuid NOT NULL REFERENCES public.atributos(id) ON DELETE CASCADE,
    valor text NOT NULL,
    slug text NOT NULL,
    color_hex text,
    orden integer NOT NULL DEFAULT 0,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.categoria_atributos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria_id uuid NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
    atributo_id uuid NOT NULL REFERENCES public.atributos(id) ON DELETE CASCADE,
    requerido boolean NOT NULL DEFAULT false,
    orden integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.producto_variante_valores (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    variante_id uuid NOT NULL REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
    atributo_id uuid NOT NULL REFERENCES public.atributos(id) ON DELETE CASCADE,
    atributo_valor_id uuid NOT NULL REFERENCES public.atributo_valores(id) ON DELETE CASCADE
);

COMMIT;