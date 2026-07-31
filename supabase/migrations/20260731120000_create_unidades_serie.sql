-- Productos serializados (rubro electro): una fila = UNA unidad física con
-- su IMEI/serie. Hasta ahora el stock vivía solo como un contador en
-- `producto_variantes.stock`, que alcanza para indumentaria (tres remeras
-- talle M son intercambiables) pero no para un celular: la garantía, el
-- reclamo al proveedor y la trazabilidad son POR APARATO.
--
-- Esta migración SOLO crea la tabla. El flujo de ventas no se toca todavía:
-- create-sale.ts sigue descontando por `ajustar_stock_variante` y nada lee
-- ni escribe unidades_serie. La consecuencia consciente es que, hasta que
-- se cablee la venta, `unidades_serie` puede quedar desincronizada respecto
-- de `producto_variantes.stock` — la fuente de verdad del stock sigue
-- siendo la variante, y esta tabla es un registro paralelo de series.
--
-- Cuando se cablee, la marca de vendido tiene que ir por UPDATE condicional
-- (`where estado = 'disponible'` + chequeo de filas afectadas) ANTES de
-- cualquier escritura derivada, igual que ajustar_stock_variante y
-- aprobar_orden_compra: dos cajas vendiendo el mismo IMEI a la vez leen lo
-- mismo con un select previo y las dos escriben.

CREATE TABLE public.unidades_serie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Preparación para multi-tenant (ROADMAP TIER 2). HOY el modelo es
  -- por-proyecto: una base Supabase por comercio, así que esta columna queda
  -- NULL en las 3 y NO lleva FK — no existe tabla `negocios` a la cual
  -- apuntar, y una FK a nada rompería la migración. Cuando se decida el
  -- modelo SaaS, acá entra el FK + NOT NULL + backfill, y el UNIQUE de imei
  -- pasa a ser UNIQUE (negocio_id, imei).
  negocio_id uuid,

  producto_variante_id uuid NOT NULL
    REFERENCES public.producto_variantes(id) ON DELETE CASCADE,

  -- IMEI (celulares) o número de serie (el resto de electro). UNIQUE global:
  -- con una base por comercio no hay colisión legítima posible, y el índice
  -- que crea el UNIQUE es además el que sirve para buscar por IMEI en el POS
  -- y en la consulta de garantía.
  imei text NOT NULL UNIQUE
    CHECK (length(trim(imei)) > 0),

  -- Fail-closed, mismo criterio que el resto del proyecto: un estado
  -- desconocido no entra. Ampliar el CHECK es una migración, no un accidente.
  -- ('devuelto', 'en_servicio_tecnico', 'baja' son candidatos futuros.)
  estado text NOT NULL DEFAULT 'disponible'
    CHECK (estado IN ('disponible', 'vendido')),

  fecha_ingreso timestamptz NOT NULL DEFAULT now(),
  fecha_venta timestamptz,

  -- SIN FK dura a propósito, mismo criterio que producto_variantes_auditoria:
  -- la trazabilidad de la unidad tiene que sobrevivir a que la venta
  -- desaparezca. Las ventas hoy se cancelan (cancel-sale.ts), no se borran,
  -- pero el rastro del aparato no puede depender de eso.
  venta_id uuid,

  -- Invariante de coherencia del par estado/fecha_venta, verificado por la
  -- base y no por el código que todavía no existe: 'vendido' exige fecha,
  -- 'disponible' exige que no la haya (una unidad devuelta al stock tiene
  -- que limpiar la fecha, no arrastrar la de la venta anterior).
  -- venta_id queda libre: se admite vendido sin venta_id para cargas
  -- históricas o ventas hechas fuera del sistema.
  CONSTRAINT unidades_serie_estado_fecha_coherente CHECK (
    (estado = 'vendido' AND fecha_venta IS NOT NULL)
    OR (estado = 'disponible' AND fecha_venta IS NULL)
  )
);

-- Consulta caliente del POS: "¿hay unidad libre de esta variante?".
-- Parcial porque el histórico de vendidas crece sin techo y nunca entra en
-- esa pregunta.
CREATE INDEX idx_unidades_serie_variante_disponible
  ON public.unidades_serie (producto_variante_id)
  WHERE estado = 'disponible';

-- Trazabilidad inversa: qué aparatos salieron en una venta (ticket,
-- garantía, cancelación). Parcial: las filas con venta_id NULL son la
-- mayoría mientras el stock rota.
CREATE INDEX idx_unidades_serie_venta
  ON public.unidades_serie (venta_id)
  WHERE venta_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.unidades_serie ENABLE ROW LEVEL SECURITY;

-- NO hay política para anon a propósito. El IMEI es un identificador de
-- aparato: no va al catálogo público. Sin política, con RLS activo, anon
-- queda denegado por defecto.
CREATE POLICY "Permitir todo a autenticados en unidades_serie"
  ON public.unidades_serie
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.unidades_serie IS
  'Unidades físicas serializadas (IMEI / número de serie) de productos de electro. Registro de trazabilidad y garantía por aparato. La fuente de verdad del stock sigue siendo producto_variantes.stock hasta que se cablee la venta.';

COMMENT ON COLUMN public.unidades_serie.negocio_id IS
  'Reservado para multi-tenant (ROADMAP TIER 2). NULL y sin FK en el modelo por-proyecto actual.';

COMMENT ON COLUMN public.unidades_serie.venta_id IS
  'Venta en la que salió la unidad. Sin FK dura: la trazabilidad debe sobrevivir a la desaparición de la venta.';
