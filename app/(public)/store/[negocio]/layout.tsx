import { Navbar } from "@/shared/components/navbar";
import { CartPanelPublico } from "@/features/store/components/cart-panel-publico";
import { createPublicClient } from "@/shared/config/supabase/server";
import { headers } from "next/headers";
import Link from "next/link";
import { resolveTenant } from "@/shared/lib/tenant";
import { ModoCatalogoProvider } from "@/shared/components/modo-catalogo-provider";
import { HEADER_MODO_CATALOGO } from "@/shared/lib/host-comerz";
import { urlDelPanel } from "@/shared/lib/ruteo-host";
import { COLUMNAS_CONFIG_PUBLICA } from "@/shared/lib/columnas-publicas";
import type { Metadata } from "next";

// El título sale del negocio que se está mirando: no hay tienda por defecto
// ni nombre de comercio fijo.
export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ negocio: string }> }>): Promise<Metadata> {
  const { negocio } = await params;
  const headersList = await headers();
  const { negocio: datos } = await resolveTenant({
    hostname: headersList.get("host"),
    slug: negocio,
  });

  return {
    title: `${datos.nombre} | Tienda online`,
    description: `Comprá online en ${datos.nombre}.`,
  };
}

export default async function PublicLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ negocio: string }>;
}>) {
  const { negocio } = await params;
  const headersList = await headers();
  await resolveTenant({ hostname: headersList.get("host"), slug: negocio });

  // Cómo se está sirviendo el catálogo lo decidió el middleware; acá solo se
  // lee, para que los links del cliente coincidan con la URL que se ve.
  const modo =
    headersList.get(HEADER_MODO_CATALOGO) === "subdominio"
      ? "subdominio"
      : "path";

  const supabase = await createPublicClient();

  // Las categorías principales (sin padre) van al menú hamburguesa de mobile:
  // son las mismas que muestra la portada del catálogo.
  const [{ data: config }, { data: categorias }] = await Promise.all([
    supabase
      .from("configuracion_pos")
      .select(COLUMNAS_CONFIG_PUBLICA)
      .maybeSingle(),
    supabase
      .from("categorias")
      .select("id, nombre, slug")
      .eq("activa", true)
      .is("parent_id", null)
      .order("orden", { ascending: true }),
  ]);

  return (
    <ModoCatalogoProvider modo={modo}>
      <div className="min-h-screen bg-background flex flex-col">
      <Navbar branding={config} categorias={categorias ?? []} />
      <CartPanelPublico numeroWhatsApp={config?.whatsapp} />
      {children}

      {/* FOOTER BÁSICO */}
      <footer className="bg-neutral-900 border-t border-border py-8 mt-auto flex items-center justify-center relative">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-neutral-400 boreder">
          © {new Date().getFullYear()} {config?.posName}. Todos los derechos
          reservados.
        </div>
        <Link
          href={urlDelPanel("/auth")}
          className="right-1 absolute text-sm text-muted-foreground"
        >
          Ingresar
        </Link>
        </footer>
      </div>
    </ModoCatalogoProvider>
  );
}
