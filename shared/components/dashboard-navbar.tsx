"use client";

import { SidebarIcon } from "lucide-react";
import { useSidebarStore } from "@/shared/store/sidebar-store";
import { usePathname } from "next/navigation";
import { CajaStatusButton } from "@/features/caja/ui/caja-status-button";

interface DashboardNavbarProps {
  modoCaja: string;
  userId: string;
  /** Permiso `clientes.cobrar_cc`, para el acceso al cobro desde el modal de
   * caja. Ver CajaQuickModal. */
  puedeCobrarCuentaCorriente?: boolean;
}

export function DashboardNavbar({
  modoCaja,
  userId,
  puedeCobrarCuentaCorriente = false,
}: Readonly<DashboardNavbarProps>) {
  const { toggleSidebar } = useSidebarStore();
  const pathname = usePathname();

  const getPageInfo = () => {
    if (pathname === "/")
      return {
        title: "Panel",
        description: "Bienvenido al puesto de mando. Resumen del negocio vivo.",
      };
    if (pathname.startsWith("/pos"))
      return {
        title: "Realizar Venta",
        description:
          "Carga productos, aplica descuentos, registra el pago y descuenta el stock automáticamente.",
      };
    if (pathname.startsWith("/stock"))
      return {
        title: "Inventario",
        description: "Gestiona el stock, precios y catálogo de tus productos.",
      };
    if (pathname.startsWith("/clientes"))
      return {
        title: "Directorio de Clientes",
        description:
          "Gestiona el historial de compras y las cuentas corrientes de tus clientes.",
      };
    if (pathname.startsWith("/ventas"))
      return {
        title: "Ventas",
        description:
          "Consultá el historial de ventas, comprobantes y operaciones realizadas.",
      };
    if (pathname.startsWith("/reportes"))
      return {
        title: "Reportes",
        description: "Análisis comercial, financiero e inventario del negocio.",
      };
    if (pathname.startsWith("/caja"))
      return {
        title: "Caja y Movimientos",
        description: "Apertura, arqueos y control de flujo de efectivo.",
      };
    if (pathname.startsWith("/configuracion"))
      return {
        title: "Configuración",
        description:
          "Administra las preferencias, catálogo y reglas de negocio de tu local.",
      };
    return { title: "", description: "" };
  };

  const { title, description } = getPageInfo();

  return (
    <header className="hidden md:flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-6">
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={toggleSidebar}
          className="p-1.5 -ml-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors cursor-pointer"
          aria-label="Alternar barra lateral"
        >
          <SidebarIcon className="w-5 h-5" />
        </button>

        {/* Separador vertical */}
        <div className="h-4 w-px bg-border"></div>

        {/* Título de la página y descripción */}
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          {description && (
            <>
              <span className="text-muted-foreground/40 hidden lg:block">
                |
              </span>
              <span className="text-sm font-medium text-muted-foreground hidden lg:block">
                {description}
              </span>
            </>
          )}
        </div>
      </div>

      <CajaStatusButton
        modoCaja={modoCaja}
        userId={userId}
        puedeCobrarCuentaCorriente={puedeCobrarCuentaCorriente}
      />
    </header>
  );
}
