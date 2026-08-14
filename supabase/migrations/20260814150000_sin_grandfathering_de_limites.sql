-- Se da de baja el grandfathering de límites: los comercios que ya estaban
-- pasan a los mismos topes que un alta nueva.
--
-- Revierte el override que puso 20260814120000 (75 clientes de cuenta
-- corriente y productos sin tope para los tres comercios en Emprendedor). A
-- partir de acá cada negocio tiene EXACTAMENTE los límites de su plan: los de
-- Emprendedor quedan en 50 clientes y 1000 productos, y Evens —que está en
-- Gestión— en 250 y sin tope de catálogo.
--
-- Verificado antes de aplicar: ninguno está por encima de su nuevo tope, así
-- que nadie queda bloqueado de un día para el otro.
--
--   Estilo Bonito   28 fiados / 50 · 510 productos / 1000
--   ClickTostado     2 fiados / 50 ·  11 productos / 1000
--   Ninja Camisetas  0 fiados / 50 ·  96 productos / 1000
--   Evens (Gestión) 77 fiados / 250 · 1116 productos / sin tope
--
-- La COLUMNA `reglas_override` y `reglas_negocio()` se quedan, y no es
-- residuo: el mecanismo sigue siendo la forma de sostener un acuerdo puntual
-- con un cliente sin inventarle un plan propio. Lo que se quita son los
-- valores, no la herramienta. Vaciarla también deja el sistema en un estado
-- más simple de razonar — hoy no hay ninguna excepción viva.

update public.negocios
set reglas_override = reglas_override - 'max_clientes_cuenta_corriente' - 'max_productos'
where reglas_override ?| array['max_clientes_cuenta_corriente', 'max_productos'];
