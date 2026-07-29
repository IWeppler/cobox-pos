import { getProductosAction } from "@/shared/actions/store-actions";
import { StoreCatalog } from "@/features/store/components/store-catalog";
import { createClient } from "@/shared/config/supabase/server";
import { cookies, headers } from "next/headers";
import { obtenerPrimeraImagen } from "@/features/stock/lib/stock-product-utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface StorePageProps {
  searchParams: Promise<{ categoria?: string; sub?: string; productos?: string }>;
}

async function resolverBaseUrl() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function generateMetadata({
  searchParams,
}: Readonly<StorePageProps>): Promise<Metadata> {
  const { categoria, sub, productos } = await searchParams;
  if (!categoria && !productos) return {};

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("posName, posLogo")
    .single();

  const nombreComercio = config?.posName || "Tienda Online";
  const baseUrl = await resolverBaseUrl();

  if (productos) {
    const title = `Productos seleccionados | ${nombreComercio}`;
    return {
      title,
      description: `Mirá esta selección de productos de ${nombreComercio}.`,
      metadataBase: new URL(baseUrl),
      openGraph: {
        title,
        type: "website",
        url: `${baseUrl}/store?productos=${productos}`,
        // config.posLogo se guarda como string plano (no como array
        // stringificado), a diferencia de imagen_url de productos — no
        // necesita obtenerPrimeraImagen acá.
        images: config?.posLogo ? [{ url: config.posLogo }] : undefined,
      },
    };
  }

  // Preferimos `sub` si vino — es la categoría más específica (un link a
  // "Ropa Hombre > Boxer" debe mostrar "Boxer" en el preview, no el padre).
  const { data: cat } = await supabase
    .from("categorias")
    .select("id, nombre")
    .eq("slug", sub || categoria)
    .eq("activa", true)
    .maybeSingle();

  if (!cat) return {};

  // Un padre no tiene productos con categoria_id propio (viven en sus
  // hijos) — sumamos los ids de sus hijos para no perder la imagen de
  // preview en un link a "Todo <Padre>" sin sub elegido.
  const { data: hijos } = await supabase
    .from("categorias")
    .select("id")
    .eq("parent_id", cat.id);

  const idsParaImagen = [cat.id, ...(hijos || []).map((h) => h.id)];

  const { data: primerProducto } = await supabase
    .from("productos")
    .select("imagen_url")
    .in("categoria_id", idsParaImagen)
    .eq("publicado", true)
    .not("imagen_url", "is", null)
    .limit(1)
    .maybeSingle();

  // primerProducto.imagen_url viene como JSON.stringify de un array —
  // mismo bug que en [slug]/page.tsx, hay que extraer el string plano
  // antes de mandarlo a openGraph.images.
  const imagen =
    obtenerPrimeraImagen(primerProducto?.imagen_url) || config?.posLogo || null;
  const title = `${cat.nombre} | ${nombreComercio}`;

  return {
    title,
    description: `Descubrí ${cat.nombre} en ${nombreComercio}.`,
    metadataBase: new URL(baseUrl),
    openGraph: {
      title,
      type: "website",
      url: `${baseUrl}/store?categoria=${categoria}${sub ? `&sub=${sub}` : ""}`,
      images: imagen ? [{ url: imagen }] : undefined,
    },
  };
}

export default async function StorePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [productosRes, configRes, categoriasRes] = await Promise.all([
    getProductosAction(),
    supabase.from("configuracion_pos").select("*").single(),
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
          <div className="relative w-full aspect-[21/9] sm:aspect-[4/1] rounded-2xl overflow-hidden mb-6 lg:mb-8 group">
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
                  className="bg-white text-black font-bold uppercase tracking-widest text-[10px] sm:text-xs px-8 py-3 rounded-full hover:scale-105 transition-transform"
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
