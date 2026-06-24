import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/shared/components/sidebar";
import { CartSidebar } from "@/shared/components/cart-sidebar";
import { DashboardNavbar } from "@/shared/components/dashboard-navbar";
import { ConfiguracionPOS } from "@/entities/config/types";
import { TooltipProvider } from "@/shared/ui/tooltip";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  const userRole = perfil?.rol || "VENDEDOR";

  const { data: settings } = await supabase
    .from("configuracion_pos")
    .select("id, posName, posLogo")
    .limit(1)
    .single();

  const systemBranding: ConfiguracionPOS = {
    id: settings?.id || "1",
    posName: settings?.posName || "Sistema POS",
    posLogo: settings?.posLogo || "",
    whatsapp: "",
    direccion: "",
    mensaje_ticket: "",
  };

  return (
    <div className="min-h-screen bg-sidebar flex flex-col md:flex-row">
      <Sidebar branding={systemBranding} userRole={userRole} />

      {/* Contenedor principal de la derecha */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:p-2 md:pl-0 h-screen">
        {/* El "Cajón" blanco redondeado que contiene la app */}
        <div className="flex-1 flex flex-col bg-background md:border md:border-border md:rounded-xl md:shadow-sm overflow-hidden relative">
          <DashboardNavbar />

          <main className="flex-1 p-2 lg:p-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TooltipProvider>{children}</TooltipProvider>
          </main>
        </div>
      </div>

      <CartSidebar />
    </div>
  );
}
