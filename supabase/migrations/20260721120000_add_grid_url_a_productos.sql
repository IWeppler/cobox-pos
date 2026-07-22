-- Tercer tier de imagen para productos: "grid" (320px/0.06MB), pensado
-- para las cards grandes de la grilla de /pos (VENDER). thumbnail (150px)
-- se queda para Stock y el carrito; main (600px) para el detalle.
ALTER TABLE productos ADD COLUMN grid_url text;
