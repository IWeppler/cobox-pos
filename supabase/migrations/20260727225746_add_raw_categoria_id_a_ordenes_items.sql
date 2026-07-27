-- Id resuelto de la categoría (además del nombre en raw_categoria, que
-- queda solo como texto de referencia/legacy) — el árbol de categorías
-- permite nombres repetidos bajo padres distintos ("Remeras" en Ropa
-- Mujer y en Ropa Niña), así que buscar por nombre en pasos posteriores
-- (conciliación) es ambiguo por diseño. Con el id resuelto acá en el
-- import no hace falta volver a buscar por texto nunca más.
ALTER TABLE ordenes_items
  ADD COLUMN raw_categoria_id uuid REFERENCES categorias(id) ON DELETE SET NULL;
