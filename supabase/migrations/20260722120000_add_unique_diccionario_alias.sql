-- Replica el UNIQUE constraint real de prod sobre diccionario_alias
-- (proveedor, raw_nombre), usado por el upsert onConflict en merge-purchase.ts
ALTER TABLE public.diccionario_alias
  ADD CONSTRAINT diccionario_alias_proveedor_raw_nombre_key
  UNIQUE (proveedor, raw_nombre);
