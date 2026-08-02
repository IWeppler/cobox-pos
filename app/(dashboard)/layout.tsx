import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/shared/components/sidebar";
import { DashboardNavbar } from "@/shared/components/dashboard-navbar";
import { ConfiguracionPOS } from "@/entities/config/types";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryProvider } from "@/shared/components/query-provider";
import { listarMisNegociosAction } from "@/features/auth/actions/negocios";
import { COOKIE_NEGOCIO_ACTIVO } from "@/shared/lib/negocio-activo";
import { NegocioActivoProvider } from "@/shared/components/negocio-activo-provider";

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

  // El rol es por negocio (usuarios_negocios), el nombre es del perfil global.
  const [{ data: perfil }, { data: rolActual }, negocios] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    supabase.rpc("rol_actual"),
    listarMisNegociosAction(),
  ]);

  const userRole = rolActual || "VENDEDOR";
  const negocioActivoId = cookieStore.get(COOKIE_NEGOCIO_ACTIVO)?.value;

  const { data: settings } = await supabase
    .from("configuracion_pos")
    .select("id, posName, posLogo, modo_caja")
    .limit(1)
    .single();

  const systemBranding: ConfiguracionPOS = {
    id: settings?.id || "1",
    posName: settings?.posName || "Sistema POS",
    razon_social: settings?.posName || "Sistema POS",
    cuit: "",
    condicion_iva: "",
    inicio_actividades: "",
    localidad: "",
    provincia: "",
    posLogo: settings?.posLogo || "",
    whatsapp: "",
    direccion: "",
    mensaje_ticket: "",
    modo_caja: settings?.modo_caja || "UNICA",
  };

  // Con una sola membresía no hace falta cookie: ese es el negocio activo.
  const membresiaActiva =
    negocios.find((n) => n.negocio_id === negocioActivoId) ??
    (negocios.length === 1 ? negocios[0] : null);

  const negocioActivo = membresiaActiva
    ? {
        id: membresiaActiva.negocio_id,
        slug: membresiaActiva.slug,
        nombre: membresiaActiva.nombre,
      }
    : null;

  return (
    <NegocioActivoProvider negocio={negocioActivo}>
    <div className="min-h-screen bg-sidebar flex flex-col md:flex-row">
      <Sidebar
        branding={systemBranding}
        userRole={userRole}
        userId={user.id}
        userName={perfil?.nombre || undefined}
        negocios={negocios}
        negocioActivoId={negocioActivoId}
      />

      {/* Contenedor principal de la derecha */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:p-2 md:pl-0 h-screen">
        {/* El "Cajón" blanco redondeado que contiene la app */}
        <div className="flex-1 flex flex-col bg-background md:border md:border-border md:rounded-xl md:shadow-sm overflow-hidden relative">
          <DashboardNavbar
            modoCaja={systemBranding.modo_caja || "UNICA"}
            userId={user.id}
          />

          <main className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TooltipProvider>
              <QueryProvider>{children}</QueryProvider>
            </TooltipProvider>
          </main>
        </div>
      </div>
    </div>
    </NegocioActivoProvider>
  );
}
