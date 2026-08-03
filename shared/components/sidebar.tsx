"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/features/auth/actions/logout";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  Wallet,
  ChartArea,
  Settings,
  Store,
  Users,
  Download,
  UserIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfiguracionPOS } from "@/entities/config/types";
import { CartButton } from "@/shared/ui/cart-button";
import { CajaStatusButton } from "@/features/caja/ui/caja-status-button";
import { useSidebarStore } from "@/shared/store/sidebar-store";
import { NegocioSwitcher } from "@/features/auth/ui/negocio-switcher";
import type { MembresiaNegocio } from "@/features/auth/actions/negocios";
import { useCajaStatusStore } from "@/shared/store/caja-status-store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

// 1. Grupos con estructura compacta
const NAV_GROUPS = [
  {
    label: "Operativa",
    items: [
      { name: "Panel", href: "/", icon: LayoutDashboard, adminOnly: true },
      { name: "Vender", href: "/pos", icon: Store, adminOnly: false },
      { name: "Caja", href: "/caja", icon: Wallet, adminOnly: false },
    ],
  },
  {
    label: "Gestión",
    items: [
      { name: "Inventario", href: "/stock", icon: Package, adminOnly: false },
      { name: "Ventas", href: "/ventas", icon: ShoppingCart, adminOnly: false },
      { name: "Clientes", href: "/clientes", icon: Users, adminOnly: false },
    ],
  },
  {
    label: "Herramientas",
    items: [
      { name: "Reportes", href: "/reportes", icon: ChartArea, adminOnly: true },
      {
        name: "Configuración",
        href: "/configuracion",
        icon: Settings,
        adminOnly: true,
      },
    ],
  },
];

interface SidebarProps {
  branding: ConfiguracionPOS;
  userRole: string;
  userId: string;
  userName?: string;
  /**
   * Plan del negocio ACTIVO, ya formateado (ver etiquetaPlan). Antes tenía un
   * default hardcodeado "Pro Trial" y el layout nunca lo mandaba: los tres
   * comercios mostraban el mismo plan inventado.
   */
  planName?: string;
  /** Negocios a los que pertenece el usuario. Con uno solo no hay switcher. */
  negocios?: MembresiaNegocio[];
  negocioActivoId?: string;
}
const isRunningStandalone = () => {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

export function Sidebar({
  branding,
  userRole,
  userId,
  userName = "Usuario",
  planName = "Sin plan",
  negocios = [],
  negocioActivoId,
}: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const { isCollapsed, isOpenMobile, setIsOpenMobile } = useSidebarStore();
  const isCajaAbierta = useCajaStatusStore((state) => state.isCajaAbierta);
  const fetchCajaStatusStore = useCajaStatusStore(
    (state) => state.fetchCajaStatus,
  );

  const visibleNavGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && userRole !== "ADMIN") return false;
        return true;
      }),
    })).filter((group) => group.items.length > 0);
  }, [userRole]);

  // En móvil el menú tapa la pantalla: al entrar a un módulo tiene que cerrarse
  // solo. Se hace por cambio de ruta y no con un onClick por link para que
  // valga también para el logo, el perfil y cualquier link que se agregue.
  useEffect(() => {
    setIsOpenMobile(false);
  }, [pathname, setIsOpenMobile]);

  useEffect(() => {
    let isMounted = true;
    const modo = branding.modo_caja || "UNICA";

    const fetchCajaStatus = async () => {
      if (!isMounted) return;
      await fetchCajaStatusStore(modo, userId);
    };

    fetchCajaStatus();

    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (!interval) interval = setInterval(fetchCajaStatus, 60_000);
    };
    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchCajaStatus();
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [branding.modo_caja, userId, fetchCajaStatusStore]);

  const initial = branding.posName?.substring(0, 1).toUpperCase() || "C";

  return (
    <TooltipProvider>
      {/* MOBILE TOP NAVBAR (Solo visible en celular) */}
      <div className="md:hidden flex w-full shrink-0 items-center justify-between px-4 h-16 bg-background border-b border-border sticky top-0 z-50">
        <Link
          href={userRole === "ADMIN" ? "/" : "/stock"}
          className="flex items-center gap-3 overflow-hidden"
        >
          <div className="w-9 h-9 flex items-center justify-center rounded-lg overflow-hidden border border-border bg-background shrink-0">
            {branding.posLogo ? (
              <Image
                src={branding.posLogo}
                alt={`Logo ${branding.posName}`}
                width={36}
                height={36}
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="font-bold text-lg text-muted-foreground">
                {initial}
              </span>
            )}
          </div>
          <span className="font-bold text-lg text-foreground tracking-tight truncate">
            {branding.posName}
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Con un solo negocio no hay nada que elegir y el header ya muestra
              su nombre al lado del logo: mostrarlo sería ruido. */}
          {negocios.length > 1 && (
            <NegocioSwitcher
              negocios={negocios}
              negocioActivoId={negocioActivoId}
              nombreActivo={branding.posName}
              logoActivo={branding.posLogo}
              inicial={initial}
              isCollapsed
            />
          )}
          <CajaStatusButton
            modoCaja={branding.modo_caja || "UNICA"}
            userId={userId}
            className="mr-1"
          />
          <span className="hidden sm:block">
            <CartButton />
          </span>
          <button
            onClick={() => setIsOpenMobile(!isOpenMobile)}
            className="p-2 text-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors cursor-pointer shrink-0"
            aria-label="Alternar menú"
          >
            {isOpenMobile ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* OVERLAY OSCURO MÓVIL */}
      {isOpenMobile && (
        <div
          className="md:hidden fixed inset-0 top-16 bg-black/40 z-50 backdrop-blur-sm"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* SIDEBAR DESKTOP */}
      <aside
        className={`
        fixed md:sticky top-14 md:top-0 left-0 h-[calc(100vh-56px)] md:h-screen 
        bg-sidebar border-border md:border-border/50 
        flex flex-col shrink-0 z-50 transition-all duration-300 ease-in-out
        ${isOpenMobile ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        ${isCollapsed ? "md:w-18" : "w-full md:w-64"} w-64
      `}
      >
        {/* 1. Comerz LOGO (Alineado a la izquierda, con rounded-md) */}
        <div
          className={`hidden md:flex items-center h-16 shrink-0 border-b border-border/50 transition-all duration-300 ${isCollapsed ? "justify-center px-0" : "px-4 justify-start"}`}
        >
          <Image
            src="/logow.png"
            alt="Comerz Logo"
            width={30}
            height={30}
            className="object-contain rounded-sm bg-white"
          />
          {!isCollapsed && (
            <span className="ml-2.5 font-bold text-lg tracking-tight">
              Comerz
            </span>
          )}
        </div>

        {/* 2. STORE SWITCHER — solo desktop. En móvil vive en el header, para
            no repetirlo dentro del menú desplegable. */}
        <div
          className={`hidden md:flex p-3 ${isCollapsed ? "justify-center" : ""}`}
        >
          <NegocioSwitcher
            negocios={negocios}
            negocioActivoId={negocioActivoId}
            nombreActivo={branding.posName}
            logoActivo={branding.posLogo}
            inicial={initial}
            isCollapsed={isCollapsed}
          />
        </div>

        {/* 3. NAVEGACIÓN COMPACTA */}
        {/* El cierre por cambio de ruta no cubre tocar el módulo en el que ya
            estás (la ruta no cambia); este onClick sí. */}
        <nav
          onClick={() => setIsOpenMobile(false)}
          className="flex-1 px-3 overflow-y-auto overflow-x-hidden flex flex-col"
        >
          <div className="space-y-4 pb-4 flex-1">
            {visibleNavGroups.map((group, groupIndex) => (
              <div
                key={group.label}
                className="space-y-0.5 border-t border-border"
              >
                {!isCollapsed ? (
                  <div className="px-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5 mt-2">
                    {group.label}
                  </div>
                ) : (
                  groupIndex > 0 && (
                    <div className="mx-2 border-t border-border/50 my-2" />
                  )
                )}

                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  const showCajaAlert =
                    item.name === "Caja" && isCajaAbierta === false;

                  return (
                    <Tooltip
                      key={item.href}
                      disableHoverableContent={!isCollapsed}
                    >
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={`group flex items-center rounded-sm transition-all duration-200 font-medium active:scale-[0.98] ${
                            isCollapsed
                              ? "justify-center h-9 w-9 mx-auto"
                              : "gap-3 px-2.5 py-3 md:py-2"
                          } ${
                            isActive
                              ? "bg-primary text-white"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <div className="relative flex items-center justify-center">
                            <Icon
                              className={`w-4.5 h-4.5 shrink-0 transition-colors stroke-2 ${
                                isActive
                                  ? "text-white"
                                  : "text-muted-foreground/70 group-hover:text-foreground"
                              }`}
                            />
                            {showCajaAlert && (
                              <span className="absolute -top-1 -right-1 flex h-2 w-2 ring-2 ring-sidebar rounded-full bg-rose-500" />
                            )}
                          </div>
                          {!isCollapsed && (
                            <span className="text-sm">{item.name}</span>
                          )}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" hidden={!isCollapsed}>
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>

          {/* WIDGET INSTALAR APP (Nuevo diseño premium) */}
          <div className="pb-4 mt-auto">
            <InstallAppWidget isCollapsed={isCollapsed} />
          </div>
        </nav>

        {/* 4. FOOTER (Soporte, Logout, Perfil con Plan) */}
        <div className="border-t border-border/50 p-3 flex flex-col gap-1 bg-muted/5">
          {/* <Link
            href="/soporte"
            className={`flex items-center gap-3 rounded-md px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer ${isCollapsed ? "justify-center mx-auto w-9 h-9" : ""}`}
          >
            <LifeBuoy className="w-4.5 h-4.5 stroke-2" />
            {!isCollapsed && (
              <span className="text-sm font-medium">Soporte técnico</span>
            )}
          </Link> */}

          <form action={logoutAction} className="w-full">
            <button
              type="submit"
              className={`flex items-center gap-3 rounded-md px-2 py-2 w-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer ${isCollapsed ? "justify-center mx-auto w-9 h-9" : ""}`}
            >
              <LogOut className="w-4.5 h-4.5 stroke-2" />
              {!isCollapsed && (
                <span className="text-sm font-medium">Cerrar sesión</span>
              )}
            </button>
          </form>

          <div
            className={`${isCollapsed ? "my-1" : "my-2"} border-t border-border/50 mx-1`}
          />

          {/* User Profile (Nombre + Plan) */}
          {userRole === "ADMIN" ? (
            <Link
              href="/perfil"
              className={`flex items-center gap-3 px-2 py-1.5 mt-1 rounded-md hover:bg-muted/80 transition-colors cursor-pointer group ${isCollapsed ? "justify-center" : ""}`}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <UserIcon className="w-4 h-4 text-primary" />
              </div>
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate text-foreground leading-tight group-hover:text-primary transition-colors">
                    {userName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                    {planName}
                  </p>
                </div>
              )}
            </Link>
          ) : (
            <div
              className={`flex items-center gap-3 px-2 py-1.5 mt-1 ${isCollapsed ? "justify-center" : ""}`}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-primary" />
              </div>
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate text-foreground leading-tight">
                    {userName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                    {planName}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function InstallAppWidget({ isCollapsed }: Readonly<{ isCollapsed: boolean }>) {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(isRunningStandalone);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (!isRunningStandalone()) setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  if (isStandalone || !installPrompt) return null;

  return (
    <div
      className={`transition-all duration-300 ${isCollapsed ? "" : "bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-3 shadow-sm"}`}
    >
      {isCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => installPrompt.prompt()}
              className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 hover:bg-indigo-200 transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Instalar App</TooltipContent>
        </Tooltip>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-white dark:bg-indigo-900 flex items-center justify-center shadow-sm shrink-0 border border-indigo-50 dark:border-indigo-800">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-semibold uppercase tracking-wider">
                App Nativa
              </p>
              <p className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                Instalar Comerz
              </p>
            </div>
          </div>
          <p className="text-xs text-indigo-900/70 dark:text-indigo-200/70 mb-3 leading-snug">
            Obtén la experiencia de pantalla completa y mayor velocidad.
          </p>
          <button
            onClick={() => installPrompt.prompt()}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white border border-indigo-200 dark:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500 rounded-lg py-1.5 text-sm font-bold transition-colors shadow-sm active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            Instalar ahora
          </button>
        </>
      )}
    </div>
  );
}
