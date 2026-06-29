import { LoginForm } from "@/features/auth/ui/login-form";
import Image from "next/image";
import { LayoutDashboard, Leaf, Package, ShoppingCart } from "lucide-react";

export default function AuthPage() {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* PANEL IZQUIERDO — BRANDING SAAS (Oculto en móvil) */}
      <div className="hidden lg:flex relative bg-[#0052FF] flex-col justify-between p-12 overflow-hidden">
        {/* Decoraciones de fondo abstracto (Estilo Hexágonos/Blur de la referencia) */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-white/10 rounded-full mix-blend-overlay filter blur-3xl opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[#0033CC] rounded-full filter blur-3xl opacity-50" />

        {/* Logo Superior Izquierdo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <Image
              src="/icon-192x192.png"
              alt="Logo"
              width={56}
              height={56}
              className="object-contain"
            />
          </div>
          <span className="text-white font-bold text-2xl tracking-tight">
            Sistema POS
          </span>
        </div>

        {/* Mockup Central (Simulado 100% con CSS/Tailwind) */}
        <div className="relative z-10 w-full max-w-lg mx-auto mt-12 select-none">
          {/* Ventana principal oscura */}
          <div className="bg-[#0f172a] rounded-2xl shadow-2xl border border-white/10 overflow-hidden transform transition-transform hover:scale-[1.02] duration-500">
            {/* Header del Mockup (Botones tipo Mac) */}
            <div className="h-12 border-b border-white/10 flex items-center px-4 gap-4 bg-white/5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
              </div>
              <div className="h-3 w-24 bg-white/10 rounded-full" />
            </div>

            {/* Body del Mockup */}
            <div className="p-6 flex gap-6">
              {/* Sidebar Mockup */}
              <div className="w-10 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <LayoutDashboard size={18} />
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white/30">
                  <Package size={18} />
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white/30">
                  <ShoppingCart size={18} />
                </div>
              </div>
              {/* Content Mockup */}
              <div className="flex-1 space-y-4">
                <div className="flex gap-4">
                  <div className="h-24 flex-1 bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                    <div className="h-2 w-16 bg-white/20 rounded-full" />
                    <div className="h-8 w-24 bg-white/80 rounded-full" />
                  </div>
                  <div className="h-24 flex-1 bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                    <div className="h-2 w-16 bg-white/20 rounded-full" />
                    <div className="h-8 w-20 bg-white/80 rounded-full" />
                  </div>
                </div>
                <div className="h-32 w-full bg-white/5 rounded-xl border border-white/5 p-5 space-y-4">
                  <div className="h-2.5 w-full bg-white/10 rounded-full" />
                  <div className="h-2.5 w-5/6 bg-white/10 rounded-full" />
                  <div className="h-2.5 w-4/6 bg-white/10 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Pop-up flotante blanco (Tarjeta de notificación) */}
          <div className="absolute -bottom-8 -right-8 bg-white p-5 rounded-2xl shadow-2xl border border-border w-72 animate-in slide-in-from-bottom-4 duration-1000">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                <Leaf size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground mb-0.5">
                  Nueva venta registrada
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Hace 2 segundos
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-10 flex-1 bg-muted/50 rounded-lg border border-border/50" />
              <div className="h-10 w-16 bg-emerald-50 rounded-lg border border-emerald-100" />
            </div>
          </div>
        </div>

        {/* Copy Inferior & Paginación */}
        <div className="relative z-10 text-center mt-20 max-w-md mx-auto space-y-4">
          <h2 className="text-2xl font-bold text-white leading-tight">
            Gestión comercial inteligente en tiempo real.
          </h2>
          <p className="text-blue-100/90 text-sm font-medium">
            Controla tu inventario, registra ventas y analiza tus márgenes de
            ganancia desde un solo lugar.
          </p>

          {/* Dots de Paginación */}
          <div className="flex items-center justify-center gap-2 pt-4">
            <div className="w-6 h-1.5 rounded-full bg-white" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 hover:bg-white transition-colors cursor-pointer" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 hover:bg-white transition-colors cursor-pointer" />
          </div>
        </div>
      </div>

      {/* PANEL DERECHO — FORMULARIO */}
      <div className="flex flex-col justify-center px-8 sm:px-16 py-12 lg:py-24 bg-card relative">
        <div className="w-full max-w-sm mx-auto space-y-8">
          {/* Cabecera */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-card rounded-xl flex items-center justify-center">
                <Image
                  src="/icon-192x192.png"
                  alt="Logo"
                  width={56}
                  height={56}
                  className="object-contain"
                />
              </div>
              <span className="font-bold text-xl tracking-tight text-foreground">
                Sistema POS
              </span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Iniciar sesión
              </h1>
              <p className="text-sm text-muted-foreground">
                Ingresá tus credenciales de administrador o vendedor.
              </p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Componente del formulario existente */}
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="absolute bottom-8 left-0 right-0 text-xs font-medium text-muted-foreground text-center">
          © {new Date().getFullYear()} System POS
        </p>
      </div>
    </div>
  );
}
