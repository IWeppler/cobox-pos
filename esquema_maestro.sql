
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    -- Usa el nombre que le pasemos, o la primera parte del email si no tiene
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    -- Por defecto todos nacen como VENDEDOR, a menos que le digamos lo contrario
    coalesce(new.raw_user_meta_data->>'rol', 'VENDEDOR')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."actualizaciones_precio" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text",
    "tipo_alcance" "text" NOT NULL,
    "tipo_operacion" "text" NOT NULL,
    "campo_objetivo" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "redondeo" "text",
    "cantidad_afectada" integer DEFAULT 0 NOT NULL,
    "estado" "text" DEFAULT 'APLICADO'::"text" NOT NULL,
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."actualizaciones_precio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actualizaciones_precio_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lote_id" "uuid" NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "costo_anterior" numeric(12,2) DEFAULT 0 NOT NULL,
    "costo_nuevo" numeric(12,2) DEFAULT 0 NOT NULL,
    "precio_anterior" numeric(12,2) DEFAULT 0 NOT NULL,
    "precio_nuevo" numeric(12,2) DEFAULT 0 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."actualizaciones_precio_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atributo_valores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atributo_id" "uuid" NOT NULL,
    "valor" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "color_hex" "text",
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."atributo_valores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atributos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "tipo" "text" DEFAULT 'TEXT'::"text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."atributos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bajas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "variante" "text" NOT NULL,
    "cantidad" integer NOT NULL,
    "motivo" "text" NOT NULL,
    "estado" "text" DEFAULT 'PENDIENTE'::"text" NOT NULL,
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "mermas_estado_check" CHECK (("estado" = ANY (ARRAY['PENDIENTE'::"text", 'APROBADA'::"text", 'RECHAZADA'::"text"])))
);


ALTER TABLE "public"."bajas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categoria_atributos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "categoria_id" "uuid" NOT NULL,
    "atributo_id" "uuid" NOT NULL,
    "requerido" boolean DEFAULT false NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categoria_atributos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "parent_id" "uuid",
    "descripcion" "text",
    "imagen_url" "text",
    "orden" integer DEFAULT 0 NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "dni" "text",
    "telefono" "text" NOT NULL,
    "email" "text",
    "notas" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "saldo_pendiente" numeric(12,2) DEFAULT 0 NOT NULL,
    "reglas_credito" "jsonb" DEFAULT '{}'::"jsonb",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracion_pos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "posName" "text" DEFAULT 'Vivero Tostado'::"text" NOT NULL,
    "whatsapp" "text" NOT NULL,
    "direccion" "text" DEFAULT ''::"text",
    "mensaje_ticket" "text" DEFAULT '¡Gracias por su compra!'::"text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "posLogo" "text",
    "catalogo_activo" boolean DEFAULT true,
    "mostrar_precios" boolean DEFAULT true,
    "mostrar_sin_stock" boolean DEFAULT false,
    "pedidos_whatsapp" boolean DEFAULT true,
    "direccion_visible" boolean DEFAULT true,
    "horario_visible" boolean DEFAULT true,
    "banner_activo" boolean DEFAULT false,
    "instagram" "text" DEFAULT ''::"text",
    "facebook" "text" DEFAULT ''::"text",
    "horario_texto" "text" DEFAULT ''::"text",
    "banner_imagen" "text" DEFAULT ''::"text",
    "banner_titulo" "text" DEFAULT ''::"text",
    "banner_subtitulo" "text" DEFAULT ''::"text",
    "banner_boton_texto" "text" DEFAULT ''::"text",
    "banner_link" "text" DEFAULT ''::"text",
    "marquee_activo" boolean DEFAULT false,
    "marquee_texto" "text" DEFAULT '🚀 3 CUOTAS SIN INTERÉS // ENVÍO GRATIS COMPRANDO +$50.000 // 15% OFF EN EFECTIVO 🚀'::"text",
    "cc_activas" boolean DEFAULT true,
    "cc_recargo_default" numeric(5,2) DEFAULT 0,
    "cc_anticipo_default" numeric(5,2) DEFAULT 0,
    "cc_limite_default" numeric(12,2) DEFAULT 0,
    "cc_plazo_mora" integer DEFAULT 30,
    "crm_dias_inactivo" integer DEFAULT 60,
    "modo_caja" "text" DEFAULT 'UNICA'::"text" NOT NULL,
    "requiere_caja_abierta" boolean DEFAULT true NOT NULL,
    "permitir_venta_sin_stock" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."configuracion_pos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cuenta_corriente_movimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "venta_id" "uuid",
    "pago_id" "uuid",
    "tipo" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "descripcion" "text",
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cuenta_corriente_movimientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diccionario_alias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proveedor" "text" NOT NULL,
    "raw_nombre" "text" NOT NULL,
    "producto_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."diccionario_alias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."egresos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" integer NOT NULL,
    "fecha" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "creado_por" "uuid"
);


ALTER TABLE "public"."egresos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metodos_pago" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "comision" numeric(5,2) DEFAULT 0 NOT NULL,
    "acreditacion_dias" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."metodos_pago" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordenes_compra" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proveedor" "text" NOT NULL,
    "fecha_remito" "date",
    "total_presupuestado" numeric DEFAULT 0 NOT NULL,
    "estado" "text" DEFAULT 'PENDIENTE'::"text",
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."ordenes_compra" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordenes_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid",
    "raw_nombre" "text" NOT NULL,
    "raw_variante" "text" NOT NULL,
    "cantidad" integer DEFAULT 0 NOT NULL,
    "precio_costo" numeric DEFAULT 0 NOT NULL,
    "estado_match" "text" DEFAULT 'PENDIENTE'::"text",
    "producto_id" "uuid",
    "variante_match" "text",
    "raw_categoria" "text"
);


ALTER TABLE "public"."ordenes_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text" NOT NULL,
    "rol" "text" DEFAULT 'VENDEDOR'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "perfiles_rol_check" CHECK (("rol" = ANY (ARRAY['ADMIN'::"text", 'VENDEDOR'::"text"])))
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."producto_variante_valores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "variante_id" "uuid" NOT NULL,
    "atributo_id" "uuid" NOT NULL,
    "atributo_valor_id" "uuid" NOT NULL
);


ALTER TABLE "public"."producto_variante_valores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."producto_variantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "sku" "text",
    "nombre_display" "text" NOT NULL,
    "precio" numeric,
    "costo" numeric,
    "stock" integer DEFAULT 0 NOT NULL,
    "stock_minimo" integer DEFAULT 0 NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atributos" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."producto_variantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" DEFAULT 'Interior'::"text",
    "cuidados" "text" DEFAULT 'Luz indirecta'::"text",
    "precio" numeric DEFAULT 0 NOT NULL,
    "precio_costo" numeric DEFAULT 0 NOT NULL,
    "imagen_url" "text",
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "publicado" boolean DEFAULT true,
    "slug" "text",
    "descripcion" "text",
    "categoria_id" "uuid",
    "atributos_globales" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."productos_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid",
    "variante" "text" NOT NULL,
    "cantidad" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."productos_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "tipo_regla" "text" NOT NULL,
    "tipo_descuento" "text" NOT NULL,
    "valor_descuento" numeric(12,2) NOT NULL,
    "monto_minimo" numeric(12,2) DEFAULT 0,
    "fecha_inicio" timestamp with time zone,
    "fecha_fin" timestamp with time zone,
    "limite_usos" integer,
    "usos_actuales" integer DEFAULT 0,
    "activa" boolean DEFAULT true NOT NULL,
    "acumulable" boolean DEFAULT false NOT NULL,
    "prioridad" integer DEFAULT 0 NOT NULL,
    "creado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promociones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones_categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promocion_id" "uuid" NOT NULL,
    "categoria_nombre" "text" NOT NULL
);


ALTER TABLE "public"."promociones_categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones_metodos_pago" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promocion_id" "uuid" NOT NULL,
    "metodo_pago" "text" NOT NULL
);


ALTER TABLE "public"."promociones_metodos_pago" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones_productos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promocion_id" "uuid" NOT NULL,
    "producto_id" "uuid" NOT NULL
);


ALTER TABLE "public"."promociones_productos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnos_caja" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendedor_id" "uuid" NOT NULL,
    "fecha_apertura" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "fecha_cierre" timestamp with time zone,
    "monto_inicial" numeric DEFAULT 0 NOT NULL,
    "monto_final" numeric,
    "estado" "text" DEFAULT 'ABIERTO'::"text" NOT NULL,
    "observaciones" "text",
    "efectivo_esperado" numeric,
    "modo" "text" DEFAULT 'UNICA'::"text" NOT NULL,
    "usuario_id" "uuid",
    "punto_venta_id" "uuid",
    "monto_declarado" numeric(12,2),
    "diferencia" numeric(12,2),
    "abierta_por" "uuid",
    "cerrada_por" "uuid",
    "observacion_apertura" "text",
    "observacion_cierre" "text",
    CONSTRAINT "turnos_caja_estado_check" CHECK (("estado" = ANY (ARRAY['ABIERTO'::"text", 'CERRADO'::"text"])))
);


ALTER TABLE "public"."turnos_caja" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venta_pagos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venta_id" "uuid",
    "metodo_pago_id" "uuid",
    "metodo_nombre" "text" NOT NULL,
    "metodo_tipo" "text" NOT NULL,
    "monto_bruto" numeric(12,2) NOT NULL,
    "comision_porcentaje" numeric(5,2) DEFAULT 0 NOT NULL,
    "comision_monto" numeric(12,2) DEFAULT 0 NOT NULL,
    "monto_neto" numeric(12,2) NOT NULL,
    "acreditacion_dias" integer DEFAULT 0 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cliente_id" "uuid",
    "tipo_movimiento" "text" DEFAULT 'PAGO_VENTA'::"text" NOT NULL,
    "turno_caja_id" "uuid",
    "estado_pago_operacion" "text" DEFAULT 'CONFIRMADO'::"text" NOT NULL
);


ALTER TABLE "public"."venta_pagos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ventas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cantidad" integer DEFAULT 1 NOT NULL,
    "precio_costo" numeric DEFAULT 0 NOT NULL,
    "fecha_venta" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "vendedor_id" "uuid",
    "metodo_pago" "text" DEFAULT 'EFECTIVO'::"text" NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "total_bruto" numeric(12,2),
    "comision_total" numeric(12,2) DEFAULT 0,
    "total_neto" numeric(12,2),
    "es_pago_mixto" boolean DEFAULT false,
    "cliente_id" "uuid",
    "estado_pago" "text" DEFAULT 'PAGADA'::"text" NOT NULL,
    "monto_cobrado" numeric(12,2) DEFAULT 0 NOT NULL,
    "monto_pendiente" numeric(12,2) DEFAULT 0 NOT NULL,
    "turno_caja_id" "uuid",
    "estado_operacion" "text" DEFAULT 'CONFIRMADA'::"text" NOT NULL,
    CONSTRAINT "ventas_metodo_pago_check" CHECK (("metodo_pago" = ANY (ARRAY['EFECTIVO'::"text", 'TRANSFERENCIA'::"text", 'TARJETA'::"text"])))
);


ALTER TABLE "public"."ventas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ventas_descuentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venta_id" "uuid" NOT NULL,
    "promocion_id" "uuid",
    "promocion_nombre" "text" NOT NULL,
    "tipo_descuento" "text" NOT NULL,
    "monto_descontado" numeric(12,2) NOT NULL,
    "aplicado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ventas_descuentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ventas_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venta_id" "uuid" NOT NULL,
    "producto_id" "uuid",
    "variante" "text" NOT NULL,
    "cantidad" integer NOT NULL,
    "precio_unitario" numeric NOT NULL,
    "precio_costo" numeric DEFAULT 0 NOT NULL,
    "descuento_monto" numeric(12,2) DEFAULT 0,
    "precio_final" numeric(12,2),
    "promocion_id" "uuid",
    "promocion_nombre" "text"
);


ALTER TABLE "public"."ventas_items" OWNER TO "postgres";


ALTER TABLE ONLY "public"."actualizaciones_precio_items"
    ADD CONSTRAINT "actualizaciones_precio_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actualizaciones_precio"
    ADD CONSTRAINT "actualizaciones_precio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atributo_valores"
    ADD CONSTRAINT "atributo_valores_atributo_id_slug_key" UNIQUE ("atributo_id", "slug");



ALTER TABLE ONLY "public"."atributo_valores"
    ADD CONSTRAINT "atributo_valores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atributos"
    ADD CONSTRAINT "atributos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atributos"
    ADD CONSTRAINT "atributos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."bajas"
    ADD CONSTRAINT "bajas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categoria_atributos"
    ADD CONSTRAINT "categoria_atributos_categoria_id_atributo_id_key" UNIQUE ("categoria_id", "atributo_id");



ALTER TABLE ONLY "public"."categoria_atributos"
    ADD CONSTRAINT "categoria_atributos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion_pos"
    ADD CONSTRAINT "configuracion_pos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuenta_corriente_movimientos"
    ADD CONSTRAINT "cuenta_corriente_movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diccionario_alias"
    ADD CONSTRAINT "diccionario_alias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diccionario_alias"
    ADD CONSTRAINT "diccionario_alias_proveedor_raw_nombre_key" UNIQUE ("proveedor", "raw_nombre");



ALTER TABLE ONLY "public"."egresos"
    ADD CONSTRAINT "egresos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metodos_pago"
    ADD CONSTRAINT "metodos_pago_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordenes_items"
    ADD CONSTRAINT "ordenes_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."producto_variante_valores"
    ADD CONSTRAINT "producto_variante_valores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."producto_variante_valores"
    ADD CONSTRAINT "producto_variante_valores_variante_id_atributo_id_key" UNIQUE ("variante_id", "atributo_id");



ALTER TABLE ONLY "public"."producto_variantes"
    ADD CONSTRAINT "producto_variantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."productos_stock"
    ADD CONSTRAINT "productos_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productos_stock"
    ADD CONSTRAINT "productos_stock_producto_id_variante_key" UNIQUE ("producto_id", "variante");



ALTER TABLE ONLY "public"."promociones_categorias"
    ADD CONSTRAINT "promociones_categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promociones_metodos_pago"
    ADD CONSTRAINT "promociones_metodos_pago_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promociones"
    ADD CONSTRAINT "promociones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promociones_productos"
    ADD CONSTRAINT "promociones_productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turnos_caja"
    ADD CONSTRAINT "turnos_caja_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venta_pagos"
    ADD CONSTRAINT "venta_pagos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ventas_descuentos"
    ADD CONSTRAINT "ventas_descuentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ventas_items"
    ADD CONSTRAINT "ventas_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_productos_atributos" ON "public"."productos" USING "gin" ("atributos_globales");



CREATE INDEX "idx_variantes_atributos" ON "public"."producto_variantes" USING "gin" ("atributos");



ALTER TABLE ONLY "public"."actualizaciones_precio"
    ADD CONSTRAINT "actualizaciones_precio_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."actualizaciones_precio_items"
    ADD CONSTRAINT "actualizaciones_precio_items_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "public"."actualizaciones_precio"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."actualizaciones_precio_items"
    ADD CONSTRAINT "actualizaciones_precio_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atributo_valores"
    ADD CONSTRAINT "atributo_valores_atributo_id_fkey" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categoria_atributos"
    ADD CONSTRAINT "categoria_atributos_atributo_id_fkey" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categoria_atributos"
    ADD CONSTRAINT "categoria_atributos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categorias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cuenta_corriente_movimientos"
    ADD CONSTRAINT "cuenta_corriente_movimientos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cuenta_corriente_movimientos"
    ADD CONSTRAINT "cuenta_corriente_movimientos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cuenta_corriente_movimientos"
    ADD CONSTRAINT "cuenta_corriente_movimientos_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "public"."venta_pagos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cuenta_corriente_movimientos"
    ADD CONSTRAINT "cuenta_corriente_movimientos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."diccionario_alias"
    ADD CONSTRAINT "diccionario_alias_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."egresos"
    ADD CONSTRAINT "egresos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bajas"
    ADD CONSTRAINT "mermas_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bajas"
    ADD CONSTRAINT "mermas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordenes_items"
    ADD CONSTRAINT "ordenes_items_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordenes_items"
    ADD CONSTRAINT "ordenes_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_variante_valores"
    ADD CONSTRAINT "producto_variante_valores_atributo_id_fkey" FOREIGN KEY ("atributo_id") REFERENCES "public"."atributos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_variante_valores"
    ADD CONSTRAINT "producto_variante_valores_atributo_valor_id_fkey" FOREIGN KEY ("atributo_valor_id") REFERENCES "public"."atributo_valores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_variante_valores"
    ADD CONSTRAINT "producto_variante_valores_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_variantes"
    ADD CONSTRAINT "producto_variantes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."productos_stock"
    ADD CONSTRAINT "productos_stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promociones_categorias"
    ADD CONSTRAINT "promociones_categorias_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promociones"
    ADD CONSTRAINT "promociones_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."promociones_metodos_pago"
    ADD CONSTRAINT "promociones_metodos_pago_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promociones_productos"
    ADD CONSTRAINT "promociones_productos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promociones_productos"
    ADD CONSTRAINT "promociones_productos_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turnos_caja"
    ADD CONSTRAINT "turnos_caja_abierta_por_fkey" FOREIGN KEY ("abierta_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."turnos_caja"
    ADD CONSTRAINT "turnos_caja_cerrada_por_fkey" FOREIGN KEY ("cerrada_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."turnos_caja"
    ADD CONSTRAINT "turnos_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."turnos_caja"
    ADD CONSTRAINT "turnos_caja_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venta_pagos"
    ADD CONSTRAINT "venta_pagos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venta_pagos"
    ADD CONSTRAINT "venta_pagos_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "public"."metodos_pago"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."venta_pagos"
    ADD CONSTRAINT "venta_pagos_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "public"."turnos_caja"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."venta_pagos"
    ADD CONSTRAINT "venta_pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ventas_descuentos"
    ADD CONSTRAINT "ventas_descuentos_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id");

ALTER TABLE ONLY "public"."ventas_descuentos"
    ADD CONSTRAINT "ventas_descuentos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ventas_items"
    ADD CONSTRAINT "ventas_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ventas_items"
    ADD CONSTRAINT "ventas_items_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id");

ALTER TABLE ONLY "public"."ventas_items"
    ADD CONSTRAINT "ventas_items_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "public"."turnos_caja"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;

CREATE POLICY "Actualizar actualizaciones" ON "public"."actualizaciones_precio" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Creación ventas solo auth" ON "public"."ventas" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Edicion configuracion solo auth" ON "public"."configuracion_pos" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Edición productos solo auth" ON "public"."productos" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Edición stock solo auth" ON "public"."productos_stock" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Edición ventas solo auth" ON "public"."ventas" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Insert promociones" ON "public"."promociones" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Insert promociones_categorias" ON "public"."promociones_categorias" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Insert promociones_metodos" ON "public"."promociones_metodos_pago" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Insertar actualizaciones" ON "public"."actualizaciones_precio" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Insertar items actualización" ON "public"."actualizaciones_precio_items" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Lectura actualizaciones" ON "public"."actualizaciones_precio" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Lectura items actualización" ON "public"."actualizaciones_precio_items" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Lectura publica de configuracion" ON "public"."configuracion_pos" FOR SELECT USING (true);
CREATE POLICY "Lectura pública de productos" ON "public"."productos" FOR SELECT USING (true);
CREATE POLICY "Lectura pública de stock" ON "public"."productos_stock" FOR SELECT USING (true);
CREATE POLICY "Lectura ventas solo auth" ON "public"."ventas" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Manejo diccionario" ON "public"."diccionario_alias" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Manejo ordenes_compra" ON "public"."ordenes_compra" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Manejo ordenes_items" ON "public"."ordenes_items" USING (("auth"."role"() = 'authenticated'::"text"));
CREATE POLICY "Permitir a usuarios autenticados crear bajas" ON "public"."bajas" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "creado_por"));
CREATE POLICY "Permitir actualizar bajas" ON "public"."bajas" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir actualizar promociones" ON "public"."promociones" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir actualizar stock" ON "public"."productos_stock" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir borrar items" ON "public"."ventas_items" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "Permitir cerrar turnos" ON "public"."turnos_caja" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "vendedor_id")) WITH CHECK (true);
CREATE POLICY "Permitir crear turnos" ON "public"."turnos_caja" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "vendedor_id"));
CREATE POLICY "Permitir insert a usuarios autenticados" ON "public"."venta_pagos" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Permitir insertar bajas" ON "public"."bajas" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Permitir insertar descuentos" ON "public"."ventas_descuentos" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Permitir insertar egresos" ON "public"."egresos" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Permitir insertar items" ON "public"."ventas_items" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Permitir insertar ventas" ON "public"."ventas" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Permitir lectura a usuarios autenticados" ON "public"."venta_pagos" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir lectura de métodos a usuarios autenticados" ON "public"."metodos_pago" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir lectura de perfiles" ON "public"."perfiles" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir lectura de ventas" ON "public"."ventas" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir lectura pública de categorias" ON "public"."categorias" FOR SELECT TO "anon" USING (("activa" = true));
CREATE POLICY "Permitir leer bajas a usuarios autenticados" ON "public"."bajas" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir leer descuentos" ON "public"."ventas_descuentos" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir leer egresos" ON "public"."egresos" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir leer items" ON "public"."ventas_items" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir leer turnos" ON "public"."turnos_caja" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Permitir modificaciones a usuarios autenticados" ON "public"."metodos_pago" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir modificar stock" ON "public"."productos_stock" FOR UPDATE TO "authenticated" USING (true);
CREATE POLICY "Permitir todo a autenticados en atributo_valores" ON "public"."atributo_valores" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a autenticados en atributos" ON "public"."atributos" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a autenticados en categoria_atributos" ON "public"."categoria_atributos" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a autenticados en producto_variantes" ON "public"."producto_variantes" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a autenticados en pv_valores" ON "public"."producto_variante_valores" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a usuarios autenticados (clientes)" ON "public"."clientes" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a usuarios autenticados (movimientos cc)" ON "public"."cuenta_corriente_movimientos" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a usuarios autenticados en categorias" ON "public"."categorias" TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Select promociones" ON "public"."promociones" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Select promociones_categorias" ON "public"."promociones_categorias" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Select promociones_metodos" ON "public"."promociones_metodos_pago" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."actualizaciones_precio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."actualizaciones_precio_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."atributo_valores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."atributos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bajas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."categoria_atributos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."configuracion_pos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cuenta_corriente_movimientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."diccionario_alias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."egresos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."metodos_pago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ordenes_compra" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ordenes_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."producto_variante_valores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."producto_variantes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."productos_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promociones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promociones_categorias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promociones_metodos_pago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promociones_productos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."turnos_caja" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."venta_pagos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ventas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ventas_descuentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ventas_items" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


-- -- ------------------------------------------------------------
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON TABLE "public"."actualizaciones_precio" TO "anon";
GRANT ALL ON TABLE "public"."actualizaciones_precio" TO "authenticated";
GRANT ALL ON TABLE "public"."actualizaciones_precio" TO "service_role";

GRANT ALL ON TABLE "public"."actualizaciones_precio_items" TO "anon";
GRANT ALL ON TABLE "public"."actualizaciones_precio_items" TO "authenticated";
GRANT ALL ON TABLE "public"."actualizaciones_precio_items" TO "service_role";

GRANT ALL ON TABLE "public"."atributo_valores" TO "anon";
GRANT ALL ON TABLE "public"."atributo_valores" TO "authenticated";
GRANT ALL ON TABLE "public"."atributo_valores" TO "service_role";

GRANT ALL ON TABLE "public"."atributos" TO "anon";
GRANT ALL ON TABLE "public"."atributos" TO "authenticated";
GRANT ALL ON TABLE "public"."atributos" TO "service_role";

GRANT ALL ON TABLE "public"."bajas" TO "anon";
GRANT ALL ON TABLE "public"."bajas" TO "authenticated";
GRANT ALL ON TABLE "public"."bajas" TO "service_role";

GRANT ALL ON TABLE "public"."categoria_atributos" TO "anon";
GRANT ALL ON TABLE "public"."categoria_atributos" TO "authenticated";
GRANT ALL ON TABLE "public"."categoria_atributos" TO "service_role";

GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";

GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";


GRANT ALL ON TABLE "public"."configuracion_pos" TO "anon";
GRANT ALL ON TABLE "public"."configuracion_pos" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracion_pos" TO "service_role";

GRANT ALL ON TABLE "public"."cuenta_corriente_movimientos" TO "anon";
GRANT ALL ON TABLE "public"."cuenta_corriente_movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."cuenta_corriente_movimientos" TO "service_role";

GRANT ALL ON TABLE "public"."diccionario_alias" TO "anon";
GRANT ALL ON TABLE "public"."diccionario_alias" TO "authenticated";
GRANT ALL ON TABLE "public"."diccionario_alias" TO "service_role";

GRANT ALL ON TABLE "public"."egresos" TO "anon";
GRANT ALL ON TABLE "public"."egresos" TO "authenticated";
GRANT ALL ON TABLE "public"."egresos" TO "service_role";

GRANT ALL ON TABLE "public"."metodos_pago" TO "anon";
GRANT ALL ON TABLE "public"."metodos_pago" TO "authenticated";
GRANT ALL ON TABLE "public"."metodos_pago" TO "service_role";

GRANT ALL ON TABLE "public"."ordenes_compra" TO "anon";
GRANT ALL ON TABLE "public"."ordenes_compra" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_compra" TO "service_role";

GRANT ALL ON TABLE "public"."ordenes_items" TO "anon";
GRANT ALL ON TABLE "public"."ordenes_items" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_items" TO "service_role";

GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";

GRANT ALL ON TABLE "public"."producto_variante_valores" TO "anon";
GRANT ALL ON TABLE "public"."producto_variante_valores" TO "authenticated";
GRANT ALL ON TABLE "public"."producto_variante_valores" TO "service_role";

GRANT ALL ON TABLE "public"."producto_variantes" TO "anon";
GRANT ALL ON TABLE "public"."producto_variantes" TO "authenticated";
GRANT ALL ON TABLE "public"."producto_variantes" TO "service_role";

GRANT ALL ON TABLE "public"."productos" TO "anon";
GRANT ALL ON TABLE "public"."productos" TO "authenticated";
GRANT ALL ON TABLE "public"."productos" TO "service_role";

GRANT ALL ON TABLE "public"."productos_stock" TO "anon";
GRANT ALL ON TABLE "public"."productos_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."productos_stock" TO "service_role";

GRANT ALL ON TABLE "public"."promociones" TO "anon";
GRANT ALL ON TABLE "public"."promociones" TO "authenticated";
GRANT ALL ON TABLE "public"."promociones" TO "service_role";

GRANT ALL ON TABLE "public"."promociones_categorias" TO "anon";
GRANT ALL ON TABLE "public"."promociones_categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."promociones_categorias" TO "service_role";

GRANT ALL ON TABLE "public"."promociones_metodos_pago" TO "anon";
GRANT ALL ON TABLE "public"."promociones_metodos_pago" TO "authenticated";
GRANT ALL ON TABLE "public"."promociones_metodos_pago" TO "service_role";

GRANT ALL ON TABLE "public"."promociones_productos" TO "anon";
GRANT ALL ON TABLE "public"."promociones_productos" TO "authenticated";
GRANT ALL ON TABLE "public"."promociones_productos" TO "service_role";

GRANT ALL ON TABLE "public"."turnos_caja" TO "anon";
GRANT ALL ON TABLE "public"."turnos_caja" TO "authenticated";
GRANT ALL ON TABLE "public"."turnos_caja" TO "service_role";

GRANT ALL ON TABLE "public"."venta_pagos" TO "anon";
GRANT ALL ON TABLE "public"."venta_pagos" TO "authenticated";
GRANT ALL ON TABLE "public"."venta_pagos" TO "service_role";

GRANT ALL ON TABLE "public"."ventas" TO "anon";
GRANT ALL ON TABLE "public"."ventas" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas" TO "service_role";

GRANT ALL ON TABLE "public"."ventas_descuentos" TO "anon";
GRANT ALL ON TABLE "public"."ventas_descuentos" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas_descuentos" TO "service_role";

GRANT ALL ON TABLE "public"."ventas_items" TO "anon";
GRANT ALL ON TABLE "public"."ventas_items" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas_items" TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";