import { Navbar } from "@/shared/components/navbar";
import { CartSidebar } from "@/shared/components/cart-sidebar";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

export const metadata = {
  title: "Tienda Oficial | Emprendimiento Tostado",
  description: "Encontra el producto que buscás.",
};

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: config } = await supabase
    .from("configuracion_pos")
    .select("*")
    .single();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar branding={config} />
      <CartSidebar numeroWhatsApp={config?.whatsapp} />
      {children}

      {/* FOOTER BÁSICO */}
      <footer className="bg-neutral-900 border-t border-border py-8 mt-auto flex items-center justify-center relative">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-neutral-400 boreder">
          © {new Date().getFullYear()} {config?.posName}. Todos los derechos
          reservados.
        </div>
        <Link
          href="/auth"
          className="right-1 absolute text-sm text-muted-foreground"
        >
          Ingresar
        </Link>
      </footer>
    </div>
  );
}
