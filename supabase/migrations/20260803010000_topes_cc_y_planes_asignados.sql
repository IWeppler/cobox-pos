-- Topes de cuenta corriente por plan y asignación inicial de planes.

UPDATE public.planes
SET reglas = jsonb_set(reglas, '{max_clientes_cuenta_corriente}', '75'::jsonb)
WHERE nombre = 'Emprendedor';

-- Gestión pasa a tener tope (250) así que deja de ser "ilimitada": se saca esa
-- feature del array. Si no, el plan declara una cosa y el límite dice otra, y
-- el día que se aplique el tope el cliente reclama con razón.
UPDATE public.planes
SET reglas = jsonb_set(
      jsonb_set(reglas, '{max_clientes_cuenta_corriente}', '250'::jsonb),
      '{features}',
      (SELECT jsonb_agg(f) FROM jsonb_array_elements(reglas->'features') f
        WHERE f <> '"cuenta_corriente_ilimitada"'::jsonb)
    )
WHERE nombre = 'Gestión';

UPDATE public.negocios n
SET plan_id = p.id,
    plan_vencimiento = coalesce(n.plan_vencimiento, now() + interval '12 months')
FROM public.planes p
WHERE (n.slug IN ('clicktostado', 'estilo-bonito') AND p.nombre = 'Emprendedor')
   OR (n.slug = 'evens-indumentaria' AND p.nombre = 'Gestión');
