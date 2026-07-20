import {
  getProductoBySlugAction,
  getProductosAction,
} from "@/shared/actions/store-actions";
import { ProductDetail } from "@/features/store/components/product-detail";
import { RelatedProducts } from "@/features/store/components/related-products";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getConfiguracionAction } from "@/features/config/actions/config-actions";
import { formatearMoneda } from "@/shared/utils/formatters";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
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
  const { slug } = await params;

  const [{ data: producto }, { data: config }] = await Promise.all([
    getProductoBySlugAction(slug),
    getConfiguracionAction(),
  ]);

  if (!producto) return {};

  const nombreComercio = config?.posName || "Tienda Online";
  const title = `${producto.nombre} | ${nombreComercio}`;
  const precioFmt = formatearMoneda(producto.precio);
  const description = producto.descripcion
    ? `${precioFmt} — ${producto.descripcion}`.slice(0, 160)
    : `${precioFmt}. Comprá ${producto.nombre} en ${nombreComercio}.`;

  const baseUrl = await resolverBaseUrl();
  const url = `${baseUrl}/store/${producto.slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url,
      images: producto.imagen_url ? [{ url: producto.imagen_url }] : undefined,
    },
  };
}

export default async function ProductoPage({ params }: Readonly<PageProps>) {
  const { slug } = await params;

  // Hacemos fetch en paralelo del producto actual, TODO el catálogo (para buscar similares) y la configuración.
  const [productoRes, catalogoRes, configRes] = await Promise.all([
    getProductoBySlugAction(slug),
    getProductosAction(),
    getConfiguracionAction(),
  ]);

  const { data: producto, error } = productoRes;
  const { data: todosLosProductos } = catalogoRes;
  const { data: config } = configRes;

  //  Bloquear acceso si la tienda está desactivada
  if (config && config.catalogo_activo === false) {
    return (
      <div className="min-h-screen bg-[#fffefe] flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-2">
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
