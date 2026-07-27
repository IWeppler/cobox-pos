-- Marca del proveedor leída del remito/CSV importado — mismo criterio que
-- raw_sku (columna propia, no se mezcla con raw_variante). Alimenta
-- productos.marca solo al crear el producto al vuelo desde la
-- conciliación; no se toca en reingresos de stock de productos existentes.
ALTER TABLE ordenes_items ADD COLUMN raw_marca text;
