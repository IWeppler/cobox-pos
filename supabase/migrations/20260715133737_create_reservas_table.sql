CREATE TABLE public.reservas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  variante_id uuid NOT NULL REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  venta_id    uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  nota        text,
  estado      text NOT NULL DEFAULT 'ACTIVA'
              CHECK (estado IN ('ACTIVA', 'CONFIRMADA', 'DEVUELTA')),
  creado_por  uuid REFERENCES public.perfiles(id),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz
);

CREATE INDEX reservas_variante_activa_idx ON public.reservas (variante_id) WHERE estado = 'ACTIVA';
CREATE INDEX reservas_cliente_id_idx ON public.reservas (cliente_id);

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a usuarios autenticados (reservas)"
  ON public.reservas
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.reservas TO anon;
GRANT ALL ON TABLE public.reservas TO authenticated;
GRANT ALL ON TABLE public.reservas TO service_role;
