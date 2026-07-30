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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfiguracionPOS } from "@/entities/config/types";
import { CartButton } from "@/shared/ui/cart-button";
import { CajaStatusButton } from "@/features/caja/ui/caja-status-button";
import { useSidebarStore } from "@/shared/store/sidebar-store";
import { useCajaStatusStore } from "@/shared/store/caja-status-store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

const ALL_NAV_ITEMS = [
  { name: "Panel", href: "/", icon: LayoutDashboard, adminOnly: true },
  { name: "Vender", href: "/pos", icon: Store, adminOnly: false },
  { name: "Caja", href: "/caja", icon: Wallet, adminOnly: false },
  { name: "Inventario", href: "/stock", icon: Package, adminOnly: false },
  { name: "Ventas", href: "/ventas", icon: ShoppingCart, adminOnly: false },
  { name: "Clientes", href: "/clientes", icon: Users, adminOnly: false },
  { name: "Reportes", href: "/reportes", icon: ChartArea, adminOnly: true },
  {
    name: "Configuración",
    href: "/configuracion",
    icon: Settings,
    adminOnly: true,
  },
];

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
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

interface SidebarProps {
  branding: ConfiguracionPOS;
  userRole: string;
  userId: string;
}

export function Sidebar({
  branding,
  userRole,
  userId,
}: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const { isCollapsed, isOpenMobile, setIsOpenMobile } = useSidebarStore();
  const isCajaAbierta = useCajaStatusStore((state) => state.isCajaAbierta);
  const cajaVersion = useCajaStatusStore((state) => state.version);
  const fetchCajaStatusStore = useCajaStatusStore(
    (state) => state.fetchCajaStatus,
  );

  const visibleNavItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => {
      if (item.adminOnly && userRole !== "ADMIN") {
        return false;
      }
      return true;
    });
  }, [userRole]);

  // modo_caja llega por props (ya resuelto server-side en el layout, sin
  // request extra) y userId también — el único fetch real de este efecto es
  // el de turnos_caja. Antes se pedían auth.getUser() + configuracion_pos EN
  // CADA TICK; ninguno de los dos cambia con esa frecuencia.
  useEffect(() => {
    let isMounted = true;
    const modo = branding.modo_caja || "UNICA";

    const fetchCajaStatus = async () => {
      if (!isMounted) return;
      await fetchCajaStatusStore(modo, userId);
    };

    fetchCajaStatus();

    // El polling de 60s queda solo como red de seguridad para cambios
    // hechos por OTRO usuario (ver useCajaStatusStore para el caso propio)
    // — y se pausa mientras la pestaña está en background, así 4 personas
    // con la pestaña abierta todo el turno no generan requests mientras
    // nadie está mirando la pantalla.
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
    // cajaVersion en las deps: cuando el propio usuario abre/cierra su
    // turno (ver caja-dashboard.tsx y el nuevo caja-quick-modal.tsx), esto
    // re-corre el efecto entero y dispara un fetchCajaStatus() inmediato
    // sin esperar el intervalo.
  }, [pathname, branding.modo_caja, userId, cajaVersion, fetchCajaStatusStore]);

  const initial = branding.posName;

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
          <CajaStatusButton
            modoCaja={branding.modo_caja || "UNICA"}
            userId={userId}
            className="mr-1"
          />
          {/* En celular (<640px) el carrito de POS vive en la barra fija
              inferior + Drawer (ver CartPanelAdmin), no acá. Se mantiene
              visible en el rango 640-767px (tablet portrait, este wrapper
              es `md:hidden` = <768px) sin tocar ese comportamiento. */}
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

      {/* SIDEBAR */}
      <aside
        className={`
        fixed md:sticky top-16 md:top-0 left-0 h-[calc(100vh-64px)] md:h-screen 
        bg-sidebar  border-r border-border md:border-none 
        flex flex-col shrink-0 z-50 transition-all duration-300 ease-in-out
        ${isOpenMobile ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        ${isCollapsed ? "md:w-20" : "w-full md:w-64"} w-64
      `}
      >
        {/* BRANDING DESKTOP */}
        <div
          className={`hidden md:flex items-center border-b border-transparent h-16 shrink-0 transition-all duration-300 ${isCollapsed ? "justify-center px-0" : "px-6 gap-3"}`}
        >
          <div className="w-9 h-9 flex items-center justify-center rounded-lg overflow-hidden border border-border bg-sidebar shrink-0">
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
          {!isCollapsed && (
            <span className="font-bold text-lg text-foreground tracking-tight truncate whitespace-nowrap">
              {branding.posName}
            </span>
          )}
        </div>

        {/* NAVEGACIÓN */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            const Icon = item.icon;
            const showCajaAlert =
              item.name === "Caja" && isCajaAbierta === false;

            return (
              <Tooltip key={item.href} disableHoverableContent={!isCollapsed}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpenMobile(false)}
                    className={`flex items-center rounded-lg transition-all font-medium ${
                      isCollapsed
                        ? "justify-center h-10 w-10 mx-auto"
                        : "gap-3 px-3 py-2.5"
                    } ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      <Icon
                        className={`w-5 h-5 shrink-0 transition-colors stroke-1.5 opacity-60 ${
                          isActive ? "text-primary-foreground" : ""
                        }`}
                      />
                      {showCajaAlert && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                        </span>
                      )}
                    </div>
                    {!isCollapsed && (
                      <span className="truncate">{item.name}</span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={8}
                  hidden={!isCollapsed}
                  className="font-semibold"
                >
                  {item.name}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* FOOTER / LOGOUT */}
        <div className="p-4 border-t border-border bg-muted/10 flex flex-col gap-4">
          <InstallAppButton isCollapsed={isCollapsed} />

          <form action={logoutAction}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="submit"
                  className={`flex items-center text-muted-foreground rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer font-semibold ${
                    isCollapsed
                      ? "justify-center h-12 w-12 mx-auto"
                      : "w-full gap-3 px-3.5 py-3"
                  }`}
                >
                  <LogOut className="w-[18px] h-[18px] shrink-0" />
                  {!isCollapsed && <span>Cerrar Sesión</span>}
                </button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="font-semibold">
                  Cerrar Sesión
                </TooltipContent>
              )}
            </Tooltip>
          </form>

          {/* WATERMARK POWERED BY */}
          {!isCollapsed && (
            <div className="flex text-center mx-auto pt-2 gap-1">
              <p className="text-[10px] text-muted-foreground">
                Powered by Cobox{" "}
              </p>
              <Link
                href="https://www.ignacioweppler.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-primary"
              >
                {" "}
                Ignacio Weppler
              </Link>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function InstallAppButton({ isCollapsed }: Readonly<{ isCollapsed: boolean }>) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(isRunningStandalone);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");

    const syncStandaloneState = () => {
      setIsStandalone(isRunningStandalone());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      if (!isRunningStandalone()) {
        setInstallPrompt(event as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    syncStandaloneState();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery.addEventListener("change", syncStandaloneState);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", syncStandaloneState);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt || isStandalone) return;

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setIsStandalone(isRunningStandalone());
  };

  if (isStandalone || !installPrompt) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleInstall}
          className={`flex items-center text-muted-foreground rounded-xl hover:bg-muted hover:text-foreground transition-colors cursor-pointer font-semibold ${
            isCollapsed
              ? "justify-center h-12 w-12 mx-auto"
              : "w-full gap-3 px-3.5 py-3"
          }`}
        >
          <Download className="w-[18px] h-[18px] shrink-0" />
          {!isCollapsed && <span>Instalar app</span>}
        </button>
      </TooltipTrigger>
      {isCollapsed && (
        <TooltipContent side="right" className="font-semibold">
          Instalar app
        </TooltipContent>
      )}
    </Tooltip>
  );
}
