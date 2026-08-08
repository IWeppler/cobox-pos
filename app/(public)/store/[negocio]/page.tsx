import { getProductosAction } from "@/shared/actions/store-actions";
import { StoreCatalog } from "@/features/store/components/store-catalog";
import { createPublicClient } from "@/shared/config/supabase/server";
import { headers } from "next/headers";
import { resolveTenant } from "@/shared/lib/tenant";
import { urlDeCatalogo } from "@/shared/lib/dominios";
import {
  elegirImagenOg,
  elegirImagenOgConEtiqueta,
  imagenOgConMime,
} from "@/shared/lib/og-imagen";
import { parsearIdsSeleccion } from "@/shared/utils/compartir-catalogo";
import { describirSeleccion } from "@/features/store/lib/describir-seleccion";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface StorePageProps {
  params: Promise<{ negocio: string }>;
  searchParams: Promise<{ categoria?: string; sub?: string; productos?: string }>;
}

async function resolverBaseUrl() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

type ClientePublico = Awaited<ReturnType<typeof createPublicClient>>;

/**
 * Preview de la portada de la tienda (link sin parámetros).
 *
 * Acá manda la marca: si el logo está en un formato que los scrapers dibujan,
 * va el logo. El catálogo entra solo como rescate cuando el logo es webp o
 * transparente — que es justamente el caso de Evens, donde la tarjeta salía
 * como un cuadro en blanco.
 */
async function metadataPortada(
  supabase: ClientePublico,
  nombreComercio: string,
  posLogo: string | null | undefined,
  baseUrl: string,
  negocio: string,
): Promise<Metadata> {
  const { data: candidatos } = await supabase
    .from("productos")
    .select("imagen_url")
    .eq("publicado", true)
    .not("imagen_url", "is", null)
    .limit(10);

  const imagen = elegirImagenOg([
    posLogo,
    ...(candidatos ?? []).map((p) => p.imagen_url),
  ]);
  const title = `${nombreComercio} | Tienda online`;
  const description = `Mirá el catálogo de ${nombreComercio} y hacé tu pedido online.`;

  return {
    title,
    description,
    metadataBase: new URL(baseUrl),
    openGraph: {
      title,
      description,
      siteName: nombreComercio,
      type: "website",
      url: urlDeCatalogo(negocio),
      images: imagenOgConMime(imagen, nombreComercio),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imagen ? [imagen] : undefined,
    },
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: Readonly<StorePageProps>): Promise<Metadata> {
  const { negocio } = await params;
  const { categoria, sub, productos } = await searchParams;

  const supabase = await createPublicClient();
  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("posName, posLogo")
    .maybeSingle();

  const nombreComercio = config?.posName || "Tienda Online";
  const baseUrl = await resolverBaseUrl();

  if (productos) {
    // Los productos del link se leen ACÁ, en el server: el scraper de WhatsApp
    // no ejecuta JS, así que lo que no esté en el HTML de la respuesta no
    // existe para el preview. Antes esta rama no consultaba nada y mandaba
    // siempre el logo: la selección compartida NUNCA mostraba el producto.
    const ids = parsearIdsSeleccion(productos);

    const { data: filas } = ids.length
      ? await supabase
          .from("productos")
          .select("id, nombre, precio, imagen_url, thumbnail_url")
          .in("id", ids)
          .eq("publicado", true)
      : { data: [] };

    // .in() no garantiza orden; el del link es el que eligió quien comparte,
    // y su primer producto es el que manda en el preview.
    const porId = new Map((filas ?? []).map((p) => [p.id, p]));
    const seleccionados = ids
      .map((id) => porId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    // Fallback en cascada: fotos de los productos en el orden del link y,
    // solo si ninguno tiene imagen (ids borrados o despublicados), el logo.
    // config.posLogo se guarda como string plano, no como array
    // stringificado — listarImagenes tolera las dos formas.
    const elegida = elegirImagenOgConEtiqueta([
      ...seleccionados.map((p) => ({ valor: p.imagen_url, alt: p.nombre })),
      { valor: config?.posLogo, alt: nombreComercio },
    ]);

    const { title, description } = describirSeleccion(
      seleccionados,
      nombreComercio,
    );

    return {
      title,
      description,
      metadataBase: new URL(baseUrl),
      openGraph: {
        title,
        description,
        siteName: nombreComercio,
        type: "website",
        url: `${urlDeCatalogo(negocio)}?productos=${productos}`,
        images: imagenOgConMime(elegida?.url ?? null, elegida?.alt),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: elegida ? [elegida.url] : undefined,
      },
    };
  }

  // Preferimos `sub` si vino — es la categoría más específica (un link a
  // "Ropa Hombre > Boxer" debe mostrar "Boxer" en el preview, no el padre).
  const { data: cat } = categoria
    ? await supabase
        .from("categorias")
        .select("id, nombre")
        .eq("slug", sub || categoria)
        .eq("activa", true)
        .maybeSingle()
    : { data: null };

  // Link pelado al catálogo (o categoría que ya no existe): igual merece
  // preview. Antes devolvía {} y WhatsApp mostraba la tarjeta sin imagen —
  // el mismo agujero que tenía la selección, en la portada de la tienda.
  if (!cat) {
    return metadataPortada(
      supabase,
      nombreComercio,
      config?.posLogo,
      baseUrl,
      negocio,
    );
  }

  // Un padre no tiene productos con categoria_id propio (viven en sus
  // hijos) — sumamos los ids de sus hijos para no perder la imagen de
  // preview en un link a "Todo <Padre>" sin sub elegido.
  const { data: hijos } = await supabase
    .from("categorias")
    .select("id")
    .eq("parent_id", cat.id);

  const idsParaImagen = [cat.id, ...(hijos || []).map((h) => h.id)];

  // Varios candidatos, no uno: elegirImagenOg prefiere un jpg/png sobre un
  // webp, que WhatsApp no dibuja. Con `limit(1)` no había nada para elegir.
  const { data: candidatos } = await supabase
    .from("productos")
    .select("imagen_url")
    .in("categoria_id", idsParaImagen)
    .eq("publicado", true)
    .not("imagen_url", "is", null)
    .limit(10);

  const imagen = elegirImagenOg([
    ...(candidatos ?? []).map((p) => p.imagen_url),
    config?.posLogo,
  ]);
  const title = `${cat.nombre} | ${nombreComercio}`;
  const description = `Descubrí ${cat.nombre} en ${nombreComercio}.`;

  return {
    title,
    description,
    metadataBase: new URL(baseUrl),
    openGraph: {
      title,
      description,
      siteName: nombreComercio,
      type: "website",
      url: `${urlDeCatalogo(negocio)}?categoria=${categoria}${sub ? `&sub=${sub}` : ""}`,
      images: imagenOgConMime(imagen, cat.nombre),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imagen ? [imagen] : undefined,
    },
  };
}

export default async function StorePage({ params }: Readonly<StorePageProps>) {
  const { negocio } = await params;
  const headersList = await headers();
  // Único punto de resolución del tenant: sin negocio válido, 404.
  await resolveTenant({ hostname: headersList.get("host"), slug: negocio });

  const supabase = await createPublicClient();

  const [productosRes, configRes, categoriasRes] = await Promise.all([
    getProductosAction(),
    supabase.from("configuracion_pos").select("*").maybeSingle(),
    supabase
      .from("categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true }),
  ]);

  const productos = productosRes.data || [];
  const error = productosRes.error;
  const config = configRes.data;
  const categoriasDB = categoriasRes.data || [];

  if (config && config.catalogo_activo === false) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-foreground font-bold mb-2">
          Comercio Cerrado Temporalmente
        </h1>
        <p className="text-muted-foreground text-center max-w-sm">
          En este momento no estamos recibiendo pedidos online. Por favor,
          vuelva a intentar más tarde.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 w-full">
        {config?.banner_activo && config.banner_imagen && (
          <div className="relative w-full aspect-16/12 sm:aspect-[3/1] rounded-2xl overflow-hidden mb-6 lg:mb-8 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.banner_imagen}
              alt="Banner Promocional"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center p-6">
              {config.banner_titulo && (
                <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight mb-2">
                  {config.banner_titulo}
                </h2>
              )}
              {config.banner_subtitulo && (
                <p className="text-sm md:text-lg text-white/90 font-medium max-w-xl mb-6">
                  {config.banner_subtitulo}
                </p>
              )}
              {config.banner_boton_texto && config.banner_link && (
                <a
                  href={config.banner_link}
                  className="bg-white text-neutral-900 font-bold uppercase tracking-widest text-[10px] sm:text-xs px-8 py-3 rounded-full hover:bg-white/90 transition-colors duration-300"
                >
                  {config.banner_boton_texto}
                </a>
              )}
            </div>
          </div>
        )}

        {error ? (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-center font-medium mt-8">
            Ocurrió un error al cargar el catálogo. Por favor, intenta
            nuevamente más tarde.
          </div>
        ) : (
          <StoreCatalog
            productos={productos || []}
            config={config}
            categorias={categoriasDB}
          />
        )}
      </main>
    </div>
  );
}
