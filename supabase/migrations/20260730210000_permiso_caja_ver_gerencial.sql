-- ============================================================
-- Permiso nuevo: caja.ver_gerencial
--
-- Controla quién ve la Vista Gerencial del módulo de Caja: el resumen
-- agregado del día (ventas totales, breakdown por medio de pago, y
-- esperado/real/diferencia de TODAS las cajeras, no solo las propias).
--
-- Es solo la base de permisos: no se cambia ninguna policy RLS ni la UI
-- todavía. Se asigna únicamente a ADMIN — ENCARGADO queda afuera a
-- propósito: `caja.cerrar_ajena` lo habilita a operar la caja de otro,
-- pero ver la diferencia de caja de todo el equipo es información de
-- dueño. Si más adelante se decide sumarlo, va en su propia migración.
--
-- Idempotente (ON CONFLICT DO NOTHING) porque se aplica a mano en las 3
-- bases y conviene que reaplicarla no falle.
-- ============================================================

INSERT INTO public.permisos (clave, modulo, descripcion) VALUES
  (
    'caja.ver_gerencial',
    'caja',
    'Ver la Vista Gerencial de Caja: resumen agregado del día y cierres de todas las cajeras'
  )
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.nombre = 'ADMIN'
  AND p.clave = 'caja.ver_gerencial'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
