import {
  getProductoBySlugAction,
  getProductosAction,
} from "@/shared/actions/store-actions";
import { ProductDetail } from "@/features/store/components/product-detail";
import { RelatedProducts } from "@/features/store/components/related-products";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { resolveTenant } from "@/shared/lib/tenant";
import { urlDeCatalogo } from "@/shared/lib/dominios";
import { createPublicClient } from "@/shared/config/supabase/server";
import { formatearMoneda } from "@/shared/utils/formatters";
import { obtenerPrimeraImagen } from "@/features/stock/lib/stock-product-utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * La config de la tienda se lee con el cliente público (anon + x-negocio-slug).
 * No sirve getConfiguracionAction(): ese usa el cliente con sesión, que no
 * manda el slug, y en el catálogo devolvía siempre 0 filas (PGRST116) — de ahí
 * el "Tienda Online" en vez del nombre del comercio y el WhatsApp vacío.
 */
async function getConfigPublica() {
  const supabase = await createPublicClient();
  const { data } = await supabase
    .from("configuracion_pos")
    .select("*")
    .maybeSingle();
  return data;
}

interface PageProps {
  params: Promise<{ negocio: string; producto: string }>;
}

async function resolverBaseUrl() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function generateMetadata({
  params,
}: Readonly<PageProps>): Promise<Metadata> {
  const { negocio, producto: slug } = await params;
  const headersList = await headers();
  // Valida el tenant antes de tocar datos: si la tienda no existe, 404.
  await resolveTenant({ hostname: headersList.get("host"), slug: negocio });

  const [{ data: producto }, config] = await Promise.all([
    getProductoBySlugAction(slug),
    getConfigPublica(),
  ]);

  if (!producto) return {};

  const nombreComercio = config?.posName || "Tienda Online";
  const title = `${producto.nombre} | ${nombreComercio}`;
  const precioFmt = formatearMoneda(producto.precio);
  const description = producto.descripcion
    ? `${precioFmt} — ${producto.descripcion}`.slice(0, 160)
    : `${precioFmt}. Comprá ${producto.nombre} en ${nombreComercio}.`;

  const baseUrl = await resolverBaseUrl();
  const url = urlDeCatalogo(negocio, producto.slug ?? undefined);
  // producto.imagen_url viene como JSON.stringify de un array
  // (`["https://.../foo.webp"]`), no un string plano — pasarlo tal cual a
  // openGraph.images rompe la URL: Next no la reconoce como absoluta,
  // cae al fallback de metadataBase (localhost:3000 en prod) y el string
  // stringificado termina resuelto como path relativo.
  const imagenOg = obtenerPrimeraImagen(producto.imagen_url);

  return {
    title,
    description,
    metadataBase: new URL(baseUrl),
    openGraph: {
      title,
      description,
      type: "website",
      url,
      images: imagenOg ? [{ url: imagenOg }] : undefined,
    },
  };
}

export default async function ProductoPage({ params }: Readonly<PageProps>) {
  const { negocio, producto: slug } = await params;
  const headersDelRequest = await headers();
  await resolveTenant({ hostname: headersDelRequest.get("host"), slug: negocio });

  // Hacemos fetch en paralelo del producto actual, TODO el catálogo (para buscar similares) y la configuración.
  const [productoRes, catalogoRes, config] = await Promise.all([
    getProductoBySlugAction(slug),
    getProductosAction(),
    getConfigPublica(),
  ]);

  const { data: producto, error } = productoRes;
  const { data: todosLosProductos } = catalogoRes;

  //  Bloquear acceso si la tienda está desactivada
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

  if (error || !producto) {
    notFound();
  }

  const productosSimilares = (todosLosProductos || [])
    .filter((p) => p.tipo === producto.tipo && p.id !== producto.id)
    .slice(0, 4);

  const NUMERO_WHATSAPP = config?.whatsapp;

  const baseUrl = await resolverBaseUrl();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-8 w-full">
        <ProductDetail
          producto={producto}
          baseUrl={baseUrl}
          numeroWhatsApp={NUMERO_WHATSAPP}
          config={config}
        />

        <div className="px-4 sm:px-0 pb-12">
          <RelatedProducts productos={productosSimilares} />
        </div>
      </main>
    </div>
  );
}
