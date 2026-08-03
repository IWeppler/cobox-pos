import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ShieldAlert,
  LayoutDashboard,
  Building2,
  CreditCard,
  Inbox,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/features/auth/actions/logout";
import Image from "next/image";

export default async function AdminComerzLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Validamos si es el super admin usando la función de base de datos
  const { data: isAdmin, error } = await supabase.rpc("is_super_admin");

  if (error || !isAdmin) {
    redirect("/"); // Si no es super admin, lo mandamos al inicio del POS
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar de Super Admin */}
      <aside className="w-full md:w-64 border-r border-border bg-card p-6 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Logo Superior Izquierdo */}
          <div className="top-8 left-8 flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Image
                src="/logow.png"
                alt="Logo"
                width={36}
                height={36}
                className="object-contain rounded"
              />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground">
              Comerz
            </span>
          </div>

          <nav className="space-y-1">
            <Link
              href="/admincomerz"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
            <Link
              href="/admincomerz/negocios"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              <Building2 className="w-4 h-4" />
              Comercios
            </Link>
            <Link
              href="/admincomerz/planes"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Planes
            </Link>
            <Link
              href="/admincomerz/solicitudes"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              <Inbox className="w-4 h-4" />
              Solicitudes
            </Link>
          </nav>
        </div>

        <div className="pt-6 border-t border-border">
          <div className="text-xs text-muted-foreground px-2 mb-2 truncate">
            {user.email}
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-h-screen">
        {children}
      </main>
    </div>
  );
}
