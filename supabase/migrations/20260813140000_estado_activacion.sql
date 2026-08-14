-- Estado de activación: qué le falta a un negocio nuevo para poder vender.
--
-- Es la fuente de datos del checklist de la guía de inicio (panel de inicio,
-- solo ADMIN). El punto de la función es que el estado sea DERIVADO de los
-- datos reales y no un flag guardado: un "paso 3 completado" persistido se
-- desincroniza en cuanto el comercio borra sus productos, y a partir de ahí el
-- checklist miente en verde. Derivado no puede mentir, y no hay nada que
-- migrar ni que resetear.
--
-- SECURITY INVOKER a propósito (o sea, sin `security definer`): así el
-- aislamiento lo sigue haciendo RLS, igual que para cualquier otra lectura. Con
-- definer habría que reescribir a mano el filtro por negocio y sería una
-- superficie más donde equivocarse.
--
-- Todo con EXISTS y no con count(*): la pregunta es "¿hay al menos uno?", y en
-- el negocio con 994 productos contar todo para responder eso es trabajo
-- tirado.
--
-- Gate por is_admin(): la guía es del dueño. Un vendedor no configura el
-- comercio ni da de alta empleados, así que mostrarle la lista sería darle
-- tareas que no puede hacer. Fail-closed: si no es admin devuelve null y la UI
-- no monta nada.

create or replace function public.estado_activacion()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when not public.is_admin() then null::jsonb
    else jsonb_build_object(
      -- El rubro viaja con el estado porque cambia A DÓNDE lleva el paso de
      -- cargar productos (remito vs. planilla, ver ingreso-por-rubro.ts): sin
      -- esto la UI tendría que pedir la config por separado para armar un link.
      'rubro', coalesce(
        (select c.rubro from public.configuracion_pos c limit 1),
        'indumentaria'
      ),

      -- Marca: el alta ya deja `posName` cargado, así que pedir "nombre" sería
      -- un paso que nace hecho y no enseña nada. Lo que falta de verdad
      -- después del alta es el logo (va en el ticket y en la tienda) y el
      -- WhatsApp (es por donde entran los pedidos del catálogo).
      'marca', (
        select coalesce(btrim(c."posLogo"), '') <> ''
           and coalesce(btrim(c.whatsapp), '') <> ''
        from public.configuracion_pos c limit 1
      ),

      -- Nace en true: crear_negocio_con_owner siembra Efectivo. Se lista igual
      -- porque el comercio que cobra con tarjeta tiene que saber que esto se
      -- configura, y porque un ítem ya hecho arranca la lista con progreso.
      'metodos_pago', exists (
        select 1 from public.metodos_pago m where m.activo
      ),

      'productos', exists (select 1 from public.productos p),

      -- Un producto sin precio o sin stock no se puede vender: por eso es un
      -- paso propio y no se da por hecho con el anterior. Se mira sobre
      -- producto_variantes, que es la fuente canónica (productos_stock es
      -- espejo legacy).
      --
      -- OJO con el precio, que costó un falso negativo: `producto_variantes.
      -- precio` es un OVERRIDE, no el precio. Se llena solo cuando la variante
      -- vale distinto del producto; el resto del tiempo queda en 0 y el precio
      -- real vive en `productos.precio`. Mirando solo la variante, ClickTostado
      -- y Ninja Camisetas —que venden todos los días— daban "te falta poner
      -- precios". Por eso el coalesce contra el producto, y `nullif(...,0)`
      -- porque el override vacío es 0, no null.
      'stock_y_precios', exists (
        select 1
        from public.producto_variantes v
        join public.productos p on p.id = v.producto_id
        where v.activa
          and v.stock > 0
          and coalesce(nullif(v.precio, 0), p.precio, 0) > 0
      ),

      -- Opcional en la UI: la unipersonal no tiene a nadie que sumar. > 1
      -- porque el owner ya es una fila.
      'empleados', (
        select count(*) > 1 from public.usuarios_negocios u
        where u.negocio_id = security.current_negocio_id()
      ),

      -- También opcional: hay comercios que solo venden en el mostrador. Las
      -- dos condiciones juntas porque el catálogo prendido sin un solo
      -- producto publicado es una tienda vacía.
      'catalogo_publicado', (
        select coalesce(c.catalogo_activo, false) from public.configuracion_pos c limit 1
      ) and exists (
        select 1 from public.productos p where p.publicado
      ),

      -- Alguna vez, no ahora: el paso es "aprendiste a abrir caja", y un turno
      -- ya cerrado lo demuestra igual.
      'caja', exists (select 1 from public.turnos_caja t),

      'primera_venta', exists (select 1 from public.ventas ven)
    )
  end;
$$;

comment on function public.estado_activacion is
  'Checklist de activación del negocio activo, derivado de datos reales (sin flags persistidos). Devuelve null si el usuario no es ADMIN.';

grant execute on function public.estado_activacion() to authenticated;
