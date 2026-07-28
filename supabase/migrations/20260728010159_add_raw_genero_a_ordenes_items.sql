-- Género crudo tal como vino en la columna del CSV (canonicalizado
-- Hombre/Mujer/Niño/Niña/Unisex/Bebé por el cliente, pero SIN resolver
-- contra el árbol) — hoy se usaba solo transitoriamente para resolver
-- categoría/género-en-Ropa-Bebé y se descartaba. Se persiste para que la
-- conciliación pueda mostrar "esto es lo que subiste" junto a "esto es lo
-- que el sistema entendió" (categoría/marca ya resueltas).
ALTER TABLE ordenes_items ADD COLUMN raw_genero text;
