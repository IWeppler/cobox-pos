"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Producto, ProductoIndice } from "@/entities/productos/types";
import { normalizarRubro, type Rubro } from "@/entities/config/types";
import {
  anotarStockDisponible,
  contarReservasActivasPorVariante,
} from "@/entities/productos/lib/stock-disponible";
import { traerTodo } from "@/shared/lib/traer-todo";

export async function getStockAction(): Promise<{
  data: Producto[] | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Paginado: sin esto PostgREST corta en 1000 y la pantalla de stock miente
    // por omisión — muestra parte del catálogo como si fuera todo. Ver
    // shared/lib/traer-todo.ts.
    const [{ data, error }, { data: reservasActivas }] = await Promise.all([
      traerTodo("stock (detalle)", (desde, hasta) =>
        supabase
          .from("productos")
          .select(
            `
        id, nombre, tipo, precio, precio_costo, imagen_url, thumbnail_url, slug, publicado, descripcion, categoria_id, creado_en,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          id, sku, nombre_display, precio, costo, stock, atributos,
          producto_variante_valores(
            atributo:atributos(nombre),
            atributo_valor:atributo_valores(valor)
          )
        ),
        stock:productos_stock(id, variante, cantidad)
        `,
            { count: "exact" },
          )
          .order("creado_en", { ascending: false })
          .range(desde, hasta),
      ),
      supabase.from("reservas").select("variante_id").eq("estado", "ACTIVA"),
    ]);

    if (error) return { data: null, error: "Error al cargar." };

    const reservasPorVariante =
      contarReservasActivasPorVariante(reservasActivas);
    const productos = (data as unknown as Producto[]).map((p) => ({
      ...p,
      producto_variantes: anotarStockDisponible(
        p.producto_variantes,
        reservasPorVariante,
      ),
    }));

    return { data: productos, error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}

export async function getStockIndexAction(): Promise<{
  data: ProductoIndice[] | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Paginado por el mismo motivo que getStockAction: este índice es LA lista
    // de productos de la pantalla /stock, y truncada al kilo hace que un
    // producto que existe parezca borrado.
    const { data, error } = await traerTodo("stock (índice)", (desde, hasta) =>
      supabase
        .from("productos")
        .select(
          `
        id, nombre, tipo, precio, precio_costo, categoria_id, marca, modelo,
        imagen_url, thumbnail_url, grid_url, slug, publicado, unidad_medida, destacado_en,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          id, sku, nombre_display, precio, costo, stock, atributos,
          producto_variante_valores(
            atributo:atributos(nombre),
            atributo_valor:atributo_valores(valor)
          )
        ),
        stock:productos_stock(cantidad)
        `,
          { count: "exact" },
        )
        .order("creado_en", { ascending: false })
        .range(desde, hasta),
    );

    if (error) {
      return { data: null, error: "Error al cargar el índice de productos." };
    }

    return { data: data as unknown as ProductoIndice[], error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}

// Combina el índice de stock + config para la pantalla de Stock en un solo
// fetch client-side (React Query cachea esto con staleTime de 3 min).
export async function getStockPageDataAction(): Promise<{
  data: {
    productosIndice: ProductoIndice[];
    nombreComercio: string;
    mostrarSinStock: boolean;
    rubro: Rubro;
  } | null;
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [result, configRes] = await Promise.all([
    getStockIndexAction(),
    supabase
      .from("configuracion_pos")
      .select("posName, mostrar_sin_stock, rubro")
      .single(),
  ]);

  if (result.error) {
    return { data: null, error: result.error };
  }

  // No aborta la pantalla —el inventario se puede seguir usando sin la
  // config— pero tampoco se traga el error: si esta consulta falla, los tres
  // valores de abajo caen al default a la vez y el síntoma que ve la dueña es
  // "mi comercio se llama Tienda Online y volvieron a aparecer los productos
  // sin stock", sin ninguna pista de por qué.
  if (configRes.error) {
    console.error(
      "[getStockPageDataAction] No se pudo leer configuracion_pos; se usan defaults:",
      configRes.error,
    );
  }

  return {
    data: {
      productosIndice: result.data ?? [],
      nombreComercio: configRes.data?.posName || "Tienda Online",
      mostrarSinStock: configRes.data?.mostrar_sin_stock ?? true,
      // normalizarRubro es fail-closed: si la config no cargó o trae un valor
      // desconocido, Inventario se comporta como indumentaria (lo de antes).
      rubro: normalizarRubro(configRes.data?.rubro),
    },
    error: null,
  };
}

// Detalle completo de UN producto — lo pide el sheet de edición al abrirse
// (ver ProductEditDetailSheet), nunca la lista: la tabla/grid de /stock
// rendeiza directo desde ProductoIndice, sin este fetch de por medio.
export async function getStockDetalleProductoAction(id: string): Promise<{
  data: Producto | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // OJO: adentro del string del `select` NO van comentarios, ni `--` ni
    // `/* */`. PostgREST no los parsea y supabase-js además le saca los saltos
    // de línea, así que un comentario se fusiona con la lista de campos y la
    // consulta entera vuelve PGRST100 ("failed to parse select parameter").
    // Cualquier explicación sobre estas columnas va ACÁ afuera.
    //
    // `marca, modelo, unidad_medida, tratamiento_iva, genero` son identidad y
    // datos fiscales: los pide el FORMULARIO de edición, que es el único
    // consumidor de esta consulta. Sin ellos el form los leía como undefined y
    // los mostraba con el default ("Unidad", 21%, marca vacía): el producto se
    // veía mal cargado aunque en la base estuviera bien, y guardar desde ahí
    // PISABA el valor real con el default. Así se perdía un producto que se
    // vendía por kilo cada vez que alguien le tocaba el precio.
    const { data, error } = await supabase
      .from("productos")
      .select(
        `
        id, nombre, tipo, precio, precio_costo, imagen_url, thumbnail_url, grid_url, slug, publicado, descripcion, categoria_id, creado_en,
        marca, modelo, unidad_medida, tratamiento_iva, genero,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          id, sku, nombre_display, precio, costo, stock, atributos,
          producto_variante_valores(
            atributo:atributos(nombre),
            atributo_valor:atributo_valores(valor)
          )
        ),
        stock:productos_stock(id, variante, cantidad)
        `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[getStockDetalleProductoAction] Error:", error);
      return {
        data: null,
        error: "Error al cargar el detalle del producto.",
      };
    }

    return { data: data as unknown as Producto, error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}
