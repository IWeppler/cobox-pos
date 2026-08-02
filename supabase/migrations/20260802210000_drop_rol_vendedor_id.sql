-- rol_vendedor_id() quedó huérfana: era el DEFAULT de perfiles.rol_id y ese
-- default se sacó cuando el rol pasó a ser por negocio. Devuelve "el rol
-- VENDEDOR" como si hubiera uno solo en la base, cosa que dejó de ser cierta:
-- cada negocio tiene el suyo. Dejarla viva es una trampa para el próximo que
-- necesite un rol por defecto.
DROP FUNCTION IF EXISTS public.rol_vendedor_id();
