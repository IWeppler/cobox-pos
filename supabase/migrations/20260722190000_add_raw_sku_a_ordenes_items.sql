-- SKU del proveedor leído del remito/CSV importado — viaja por su propia
-- columna (no dentro de raw_variante) para no ensuciar nombre_display ni
-- caer como atributo filtrable en producto_variantes.atributos.
ALTER TABLE ordenes_items ADD COLUMN raw_sku text;
