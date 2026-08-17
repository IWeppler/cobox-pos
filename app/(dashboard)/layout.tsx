import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/shared/components/sidebar";
import { DashboardNavbar } from "@/shared/components/dashboard-navbar";
import { ConfiguracionPOS } from "@/entities/config/types";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryProvider } from "@/shared/components/query-provider";
import { listarMisNegociosAction } from "@/features/auth/actions/negocios";
import {
  COOKIE_IMPERSONATE,
  COOKIE_NEGOCIO_ACTIVO,
} from "@/shared/lib/negocio-activo";
import { BannerImpersonation } from "@/features/admin/ui/banner-impersonation";
import { NegocioActivoProvider } from "@/shared/components/negocio-activo-provider";
import { PlanProvider } from "@/features/planes/ui/plan-provider";
import { getContextoPlanAction } from "@/features/planes/actions/contexto-plan";
import { leerConfigPos } from "@/entities/config/lib/leer-config-pos";
import { etiquetaPlan } from "@/shared/lib/planes";
import { getUsuarioActual } from "@/shared/config/supabase/usuario-actual";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { user, error } = await getUsuarioActual();

  if (error || !user) {
    redirect("/auth");
  }

  // El rol es por negocio (usuarios_negocios), el nombre es del perfil global.
  //
  // La configuración entra en esta misma tanda. Antes se leía DESPUÉS del
  // Promise.all, o sea un viaje de red entero en fila detrás de los otros
  // cuatro, en cada navegación del panel. Y `leerConfigPos` además la comparte
  // con el `generateMetadata` del layout raíz: si aquel ya la resolvió en este
  // mismo render, acá no cuesta nada.
  const [{ data: perfil }, { data: rolActual }, negocios, contextoPlan, config] =
    await Promise.all([
      supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
      supabase.rpc("rol_actual"),
      listarMisNegociosAction(),
      getContextoPlanAction(),
      leerConfigPos(),
    ]);

  const userRole = rolActual || "VENDEDOR";
  const negocioActivoId = cookieStore.get(COOKIE_NEGOCIO_ACTIVO)?.value;
  // Modo dios: el super admin mirando el negocio de un cliente.
  const impersonando = Boolean(cookieStore.get(COOKIE_IMPERSONATE)?.value);

  const settings = config;

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
      <PlanProvider contexto={contextoPlan}>
    <div className="min-h-screen bg-sidebar flex flex-col md:flex-row">
      <Sidebar
        branding={systemBranding}
        userRole={userRole}
        userId={user.id}
        userName={perfil?.nombre || undefined}
        // El plan es del NEGOCIO ACTIVO, no del usuario: el mismo usuario ve
        // "Plan Gestión" en un negocio y otro plan en el que tiene al lado.
        planName={etiquetaPlan(contextoPlan.planActual)}
        negocios={negocios}
        negocioActivoId={negocioActivoId}
      />

      {/* Contenedor principal de la derecha */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:p-2 md:pl-0 h-screen">
        {/* El "Cajón" blanco redondeado que contiene la app */}
        <div className="flex-1 flex flex-col bg-background md:border md:border-border md:rounded-xl md:shadow-sm overflow-hidden relative">
          {impersonando && (
            <BannerImpersonation nombreNegocio={systemBranding.posName} />
          )}
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
      </PlanProvider>
    </NegocioActivoProvider>
  );
}
