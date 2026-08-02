-- Storage por negocio.
--
-- Las policies de los buckets `productos` y `logos` eran `bucket_id = '...'` a
-- secas para authenticated: cualquier usuario de cualquier comercio podía
-- sobrescribir o BORRAR las fotos de otro. Ahora la escritura solo se permite
-- dentro de la carpeta del negocio activo: <negocio_id>/...
--
-- Los ~3.400 archivos que ya existen quedan donde están, en rutas legacy
-- (raíz, thumbs/, grids/, optimized/). Se siguen leyendo —los buckets son
-- públicos y el catálogo los sirve— pero pasan a ser inmutables: nadie los
-- puede pisar ni borrar, que es justamente la garantía que faltaba. Moverlos
-- exige la Storage API (no basta un UPDATE a storage.objects) y reescribir las
-- URLs guardadas en productos e imágenes de configuración; va aparte.

-- Limpieza de las policies viejas, incluidas las duplicadas que quedaron del
-- editor de Supabase (1peuqw_0..3).
DROP POLICY IF EXISTS "Admin gestiona logos (Delete)" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona logos (Insert)" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona logos (Update)" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona logos 1peuqw_0" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona logos 1peuqw_1" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona logos 1peuqw_2" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona logos 1peuqw_3" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona productos (Delete)" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona productos (Insert)" ON storage.objects;
DROP POLICY IF EXISTS "Admin gestiona productos (Update)" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica de logos" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica de logos 1peuqw_0" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica de productos" ON storage.objects;

-- Lectura: sigue siendo pública. El catálogo es público por definición y las
-- URLs de las imágenes ya están circulando por WhatsApp.
CREATE POLICY "Lectura publica de imagenes"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('productos', 'logos'));

-- Escritura: solo dentro de la carpeta del negocio activo.
-- storage.foldername(name) devuelve el array de carpetas; [1] es la primera.
-- Un archivo en la raíz devuelve un array vacío, así que [1] es NULL y la
-- comparación da NULL = deniega. Fail-closed.
CREATE POLICY "Subir imagenes del propio negocio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('productos', 'logos')
    AND (storage.foldername(name))[1] = security.current_negocio_id()::text
  );

CREATE POLICY "Actualizar imagenes del propio negocio"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('productos', 'logos')
    AND (storage.foldername(name))[1] = security.current_negocio_id()::text
  )
  WITH CHECK (
    bucket_id IN ('productos', 'logos')
    AND (storage.foldername(name))[1] = security.current_negocio_id()::text
  );

CREATE POLICY "Borrar imagenes del propio negocio"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('productos', 'logos')
    AND (storage.foldername(name))[1] = security.current_negocio_id()::text
  );
