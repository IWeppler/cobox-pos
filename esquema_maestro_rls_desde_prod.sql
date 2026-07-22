-- =====================================================================
-- RLS real de producción (Evens) — extraído en vivo
-- desde pg_policies / pg_class / pg_proc el 2026-07-21.
--
-- Contexto: ni supabase/migrations/20260101000000_esquema_maestro.sql
-- (aplicado al proyecto nuevo, sin políticas) ni esquema_maestro.sql
-- (raíz del repo, nunca aplicado) reflejan fielmente lo que hoy protege
-- los datos de prod. El archivo de la raíz resultó ser MÁS VIEJO de lo
-- pensado: le faltan las tablas de RBAC completas (roles, permisos,
-- rol_permisos), producto_variantes_auditoria, reservas, las políticas
-- de lectura pública de catálogo (producto_variantes, promociones y
-- afines) y varias políticas de ownership/RBAC más estrictas en ventas,
-- venta_pagos, turnos_caja, egresos, actualizaciones_precio y perfiles.
--
-- Este archivo es la reconstrucción 1:1 de lo que hoy existe en prod
-- (88 políticas sobre 34 tablas). Pensado para aplicarse al proyecto
-- nuevo (athoqlvyagdjbgeoftzz, "Cobox-estilobonito"), que ya tiene el
-- esquema de las 32 migraciones pero sin estas políticas.
--
-- Idempotente: puede correrse más de una vez sin error.
-- NO se aplicó a ningún proyecto — requiere confirmación antes de correr.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones RBAC de las que dependen varias políticas (is_admin ya
-- existía antes del RBAC; tiene_permiso lo generaliza). Se incluyen acá
-- por si el proyecto nuevo no las tiene desde las 32 migraciones —
-- CREATE OR REPLACE es seguro de re-ejecutar.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    JOIN public.roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid() AND r.nombre = 'ADMIN'
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(clave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      JOIN public.roles r ON r.id = p.rol_id
      WHERE p.id = auth.uid() AND r.nombre = 'ADMIN'
    )
    OR EXISTS (
      SELECT 1
      FROM public.perfiles p
      JOIN public.rol_permisos rp ON rp.rol_id = p.rol_id
      JOIN public.permisos perm ON perm.id = rp.permiso_id
      WHERE p.id = auth.uid() AND perm.clave = tiene_permiso.clave
    );
$function$;

-- ---------------------------------------------------------------------
-- Habilitar RLS en todas las tablas (34, todas relrowsecurity=true en
-- prod, ninguna con FORCE ROW LEVEL SECURITY)
-- ---------------------------------------------------------------------

ALTER TABLE public.actualizaciones_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actualizaciones_precio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atributo_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atributos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria_atributos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuenta_corriente_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diccionario_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.egresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_variante_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_variantes_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones_metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_descuentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_items ENABLE ROW LEVEL SECURITY;

-- NOTA: promociones_productos tiene RLS activo pero CERO políticas,
-- tanto en prod como en esquema_maestro.sql (raíz). Esto es un bug
-- compartido por ambos, no una diferencia entre archivos: con RLS
-- encendido y sin políticas, la tabla queda inaccesible vía PostgREST
-- para anon/authenticated. Se replica el estado real (sin políticas)
-- porque el objetivo de este archivo es reflejar prod tal cual está,
-- pero convendría decidir aparte si hay que agregarle una política.

-- ---------------------------------------------------------------------
-- Políticas (88), agrupadas por tabla, idempotentes vía DROP POLICY IF EXISTS
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Actualizar actualizaciones solo admin" ON public.actualizaciones_precio;
CREATE POLICY "Actualizar actualizaciones solo admin" ON public.actualizaciones_precio FOR UPDATE TO public
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Insertar actualizaciones" ON public.actualizaciones_precio;
CREATE POLICY "Insertar actualizaciones" ON public.actualizaciones_precio FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura actualizaciones" ON public.actualizaciones_precio;
CREATE POLICY "Lectura actualizaciones" ON public.actualizaciones_precio FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS actualizaciones_precio_items_insert_propio ON public.actualizaciones_precio_items;
CREATE POLICY actualizaciones_precio_items_insert_propio ON public.actualizaciones_precio_items FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM actualizaciones_precio ap
  WHERE ((ap.id = actualizaciones_precio_items.lote_id) AND (ap.creado_por = auth.uid())))));

DROP POLICY IF EXISTS actualizaciones_precio_items_select_propio_o_admin ON public.actualizaciones_precio_items;
CREATE POLICY actualizaciones_precio_items_select_propio_o_admin ON public.actualizaciones_precio_items FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM actualizaciones_precio ap
  WHERE ((ap.id = actualizaciones_precio_items.lote_id) AND ((ap.creado_por = auth.uid()) OR is_admin())))));

DROP POLICY IF EXISTS "Permitir todo a autenticados en atributo_valores" ON public.atributo_valores;
CREATE POLICY "Permitir todo a autenticados en atributo_valores" ON public.atributo_valores FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a autenticados en atributos" ON public.atributos;
CREATE POLICY "Permitir todo a autenticados en atributos" ON public.atributos FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir a usuarios autenticados crear bajas" ON public.bajas;
CREATE POLICY "Permitir a usuarios autenticados crear bajas" ON public.bajas FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = creado_por));

DROP POLICY IF EXISTS "Permitir actualizar bajas" ON public.bajas;
CREATE POLICY "Permitir actualizar bajas" ON public.bajas FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir insertar bajas" ON public.bajas;
CREATE POLICY "Permitir insertar bajas" ON public.bajas FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leer bajas a usuarios autenticados" ON public.bajas;
CREATE POLICY "Permitir leer bajas a usuarios autenticados" ON public.bajas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir todo a autenticados en categoria_atributos" ON public.categoria_atributos;
CREATE POLICY "Permitir todo a autenticados en categoria_atributos" ON public.categoria_atributos FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Gestion total de categorias a usuarios autenticados" ON public.categorias;
CREATE POLICY "Gestion total de categorias a usuarios autenticados" ON public.categorias FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura publica de categorias" ON public.categorias;
CREATE POLICY "Permitir lectura publica de categorias" ON public.categorias FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir lectura pública de categorias" ON public.categorias;
CREATE POLICY "Permitir lectura pública de categorias" ON public.categorias FOR SELECT TO anon
  USING ((activa = true));

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en categorias" ON public.categorias;
CREATE POLICY "Permitir todo a usuarios autenticados en categorias" ON public.categorias FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados (clientes)" ON public.clientes;
CREATE POLICY "Permitir todo a usuarios autenticados (clientes)" ON public.clientes FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Edicion configuracion solo auth" ON public.configuracion_pos;
CREATE POLICY "Edicion configuracion solo auth" ON public.configuracion_pos FOR UPDATE TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Lectura publica de configuracion" ON public.configuracion_pos;
CREATE POLICY "Lectura publica de configuracion" ON public.configuracion_pos FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados (movimientos cc)" ON public.cuenta_corriente_movimientos;
CREATE POLICY "Permitir todo a usuarios autenticados (movimientos cc)" ON public.cuenta_corriente_movimientos FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Manejo diccionario" ON public.diccionario_alias;
CREATE POLICY "Manejo diccionario" ON public.diccionario_alias FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Permitir gestion de diccionario a staff" ON public.diccionario_alias;
CREATE POLICY "Permitir gestion de diccionario a staff" ON public.diccionario_alias FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS egresos_insert_propio ON public.egresos;
CREATE POLICY egresos_insert_propio ON public.egresos FOR INSERT TO authenticated
  WITH CHECK ((creado_por = auth.uid()));

DROP POLICY IF EXISTS egresos_select_propio_o_admin ON public.egresos;
CREATE POLICY egresos_select_propio_o_admin ON public.egresos FOR SELECT TO authenticated
  USING (((creado_por = auth.uid()) OR is_admin()));

DROP POLICY IF EXISTS "Permitir lectura de métodos a usuarios autenticados" ON public.metodos_pago;
CREATE POLICY "Permitir lectura de métodos a usuarios autenticados" ON public.metodos_pago FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir modificaciones a usuarios autenticados" ON public.metodos_pago;
CREATE POLICY "Permitir modificaciones a usuarios autenticados" ON public.metodos_pago FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Manejo ordenes_compra" ON public.ordenes_compra;
CREATE POLICY "Manejo ordenes_compra" ON public.ordenes_compra FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Permitir gestion de ordenes a staff" ON public.ordenes_compra;
CREATE POLICY "Permitir gestion de ordenes a staff" ON public.ordenes_compra FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Manejo ordenes_items" ON public.ordenes_items;
CREATE POLICY "Manejo ordenes_items" ON public.ordenes_items FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Permitir gestion de items a staff" ON public.ordenes_items;
CREATE POLICY "Permitir gestion de items a staff" ON public.ordenes_items FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura de perfiles" ON public.perfiles;
CREATE POLICY "Permitir lectura de perfiles" ON public.perfiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS perfiles_update_admin ON public.perfiles;
CREATE POLICY perfiles_update_admin ON public.perfiles FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS permisos_select_admin ON public.permisos;
CREATE POLICY permisos_select_admin ON public.permisos FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Lectura pública de producto_variante_valores" ON public.producto_variante_valores;
CREATE POLICY "Lectura pública de producto_variante_valores" ON public.producto_variante_valores FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir todo a autenticados en pv_valores" ON public.producto_variante_valores;
CREATE POLICY "Permitir todo a autenticados en pv_valores" ON public.producto_variante_valores FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura pública de producto_variantes" ON public.producto_variantes;
CREATE POLICY "Lectura pública de producto_variantes" ON public.producto_variantes FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir insertar variantes a autenticados" ON public.producto_variantes;
CREATE POLICY "Permitir insertar variantes a autenticados" ON public.producto_variantes FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a autenticados en producto_variantes" ON public.producto_variantes;
CREATE POLICY "Permitir todo a autenticados en producto_variantes" ON public.producto_variantes FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS producto_variantes_auditoria_insert_authenticated ON public.producto_variantes_auditoria;
CREATE POLICY producto_variantes_auditoria_insert_authenticated ON public.producto_variantes_auditoria FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS producto_variantes_auditoria_select_admin ON public.producto_variantes_auditoria;
CREATE POLICY producto_variantes_auditoria_select_admin ON public.producto_variantes_auditoria FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Edición productos solo auth" ON public.productos;
CREATE POLICY "Edición productos solo auth" ON public.productos FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Lectura pública de productos" ON public.productos;
CREATE POLICY "Lectura pública de productos" ON public.productos FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir insertar productos a autenticados" ON public.productos;
CREATE POLICY "Permitir insertar productos a autenticados" ON public.productos FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Edición stock solo auth" ON public.productos_stock;
CREATE POLICY "Edición stock solo auth" ON public.productos_stock FOR ALL TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Lectura pública de stock" ON public.productos_stock;
CREATE POLICY "Lectura pública de stock" ON public.productos_stock FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir actualizar stock" ON public.productos_stock;
CREATE POLICY "Permitir actualizar stock" ON public.productos_stock FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir insertar stock a autenticados" ON public.productos_stock;
CREATE POLICY "Permitir insertar stock a autenticados" ON public.productos_stock FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir modificar stock" ON public.productos_stock;
CREATE POLICY "Permitir modificar stock" ON public.productos_stock FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Insert promociones" ON public.promociones;
CREATE POLICY "Insert promociones" ON public.promociones FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura pública de promociones" ON public.promociones;
CREATE POLICY "Lectura pública de promociones" ON public.promociones FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Permitir actualizar promociones" ON public.promociones;
CREATE POLICY "Permitir actualizar promociones" ON public.promociones FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Select promociones" ON public.promociones;
CREATE POLICY "Select promociones" ON public.promociones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Insert promociones_categorias" ON public.promociones_categorias;
CREATE POLICY "Insert promociones_categorias" ON public.promociones_categorias FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura pública de promociones_categorias" ON public.promociones_categorias;
CREATE POLICY "Lectura pública de promociones_categorias" ON public.promociones_categorias FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Select promociones_categorias" ON public.promociones_categorias;
CREATE POLICY "Select promociones_categorias" ON public.promociones_categorias FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Insert promociones_metodos" ON public.promociones_metodos_pago;
CREATE POLICY "Insert promociones_metodos" ON public.promociones_metodos_pago FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura pública de promociones_metodos_pago" ON public.promociones_metodos_pago;
CREATE POLICY "Lectura pública de promociones_metodos_pago" ON public.promociones_metodos_pago FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Select promociones_metodos" ON public.promociones_metodos_pago;
CREATE POLICY "Select promociones_metodos" ON public.promociones_metodos_pago FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados (reservas)" ON public.reservas;
CREATE POLICY "Permitir todo a usuarios autenticados (reservas)" ON public.reservas FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS rol_permisos_delete_admin ON public.rol_permisos;
CREATE POLICY rol_permisos_delete_admin ON public.rol_permisos FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS rol_permisos_insert_admin ON public.rol_permisos;
CREATE POLICY rol_permisos_insert_admin ON public.rol_permisos FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS rol_permisos_select_admin ON public.rol_permisos;
CREATE POLICY rol_permisos_select_admin ON public.rol_permisos FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS rol_permisos_update_admin ON public.rol_permisos;
CREATE POLICY rol_permisos_update_admin ON public.rol_permisos FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS roles_select_admin ON public.roles;
CREATE POLICY roles_select_admin ON public.roles FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Permitir crear turnos" ON public.turnos_caja;
CREATE POLICY "Permitir crear turnos" ON public.turnos_caja FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = vendedor_id));

DROP POLICY IF EXISTS turnos_caja_select_propio_o_admin ON public.turnos_caja;
CREATE POLICY turnos_caja_select_propio_o_admin ON public.turnos_caja FOR SELECT TO authenticated
  USING (((vendedor_id = auth.uid()) OR tiene_permiso('caja.cerrar_ajena'::text) OR (modo = 'UNICA'::text)));

DROP POLICY IF EXISTS turnos_caja_update_propio ON public.turnos_caja;
CREATE POLICY turnos_caja_update_propio ON public.turnos_caja FOR UPDATE TO authenticated
  USING (((auth.uid() = vendedor_id) OR tiene_permiso('caja.cerrar_ajena'::text)))
  WITH CHECK (((auth.uid() = vendedor_id) OR tiene_permiso('caja.cerrar_ajena'::text)));

DROP POLICY IF EXISTS "Permitir insert a usuarios autenticados" ON public.venta_pagos;
CREATE POLICY "Permitir insert a usuarios autenticados" ON public.venta_pagos FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura a usuarios autenticados" ON public.venta_pagos;
CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.venta_pagos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS venta_pagos_update_de_venta_propia_o_admin ON public.venta_pagos;
CREATE POLICY venta_pagos_update_de_venta_propia_o_admin ON public.venta_pagos FOR UPDATE TO authenticated
  USING ((is_admin() OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = venta_pagos.venta_id) AND (v.vendedor_id = auth.uid()))))))
  WITH CHECK ((is_admin() OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = venta_pagos.venta_id) AND (v.vendedor_id = auth.uid()))))));

DROP POLICY IF EXISTS "Creación ventas solo auth" ON public.ventas;
CREATE POLICY "Creación ventas solo auth" ON public.ventas FOR INSERT TO public
  WITH CHECK ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Lectura ventas solo auth" ON public.ventas;
CREATE POLICY "Lectura ventas solo auth" ON public.ventas FOR SELECT TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Permitir insertar ventas" ON public.ventas;
CREATE POLICY "Permitir insertar ventas" ON public.ventas FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura de ventas" ON public.ventas;
CREATE POLICY "Permitir lectura de ventas" ON public.ventas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ventas_delete_propia_o_admin ON public.ventas;
CREATE POLICY ventas_delete_propia_o_admin ON public.ventas FOR DELETE TO authenticated
  USING (((vendedor_id = auth.uid()) OR is_admin()));

DROP POLICY IF EXISTS ventas_update_propia_o_admin ON public.ventas;
CREATE POLICY ventas_update_propia_o_admin ON public.ventas FOR UPDATE TO authenticated
  USING ((((vendedor_id = auth.uid()) OR tiene_permiso('ventas.ver_todas'::text)) AND tiene_permiso('ventas.anular'::text)))
  WITH CHECK ((((vendedor_id = auth.uid()) OR tiene_permiso('ventas.ver_todas'::text)) AND tiene_permiso('ventas.anular'::text)));

DROP POLICY IF EXISTS "Permitir insertar descuentos" ON public.ventas_descuentos;
CREATE POLICY "Permitir insertar descuentos" ON public.ventas_descuentos FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leer descuentos" ON public.ventas_descuentos;
CREATE POLICY "Permitir leer descuentos" ON public.ventas_descuentos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir borrar items" ON public.ventas_items;
CREATE POLICY "Permitir borrar items" ON public.ventas_items FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir insertar items" ON public.ventas_items;
CREATE POLICY "Permitir insertar items" ON public.ventas_items FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leer items" ON public.ventas_items;
CREATE POLICY "Permitir leer items" ON public.ventas_items FOR SELECT TO authenticated
  USING (true);
