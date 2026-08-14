import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Building2, CreditCard, LogOut } from "lucide-react";
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
    // Dark fijo, sin seguir el tema del sistema: este panel es una herramienta
    // interna de una sola persona, no un producto que se adapta a nadie. El
    // `dark` en el contenedor hace que los tokens de shadcn (usados por los
    // dropdowns y los dialogs de acá adentro) tomen su versión oscura; el resto
    // de la UI usa colores explícitos sobre negro.
    <div className="dark flex min-h-screen flex-col bg-zinc-950 text-white md:flex-row">
      {/* En mobile es una barra de una línea, no una columna: siendo
          `w-full` + `flex-col`, el logo, los tres links apilados y el logout
          se comían media pantalla antes de que empezara el contenido. Acá el
          eje cambia con el breakpoint —fila arriba en mobile, columna al
          costado en desktop— y los links van en scroll horizontal, así sumar
          uno nuevo no vuelve a hacer crecer la barra. */}
      <aside className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-white/10 bg-zinc-900/50 px-4 py-3 md:w-64 md:flex-col md:items-stretch md:border-b-0 md:border-r md:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:block md:space-y-6">
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
              <Image
                src="/logow.png"
                alt="Logo"
                width={36}
                height={36}
                className="rounded object-contain"
              />
            </div>
            {/* El nombre se esconde en mobile: el logo ya identifica y el
                espacio lo necesitan los links. */}
            <span className="hidden text-lg font-bold tracking-tight text-white md:inline">
              Comerz
            </span>
          </div>

          {/* El link a /admincomerz/solicitudes se sacó: esa ruta no existe y
              daba 404. Lo que iba a mostrar —los pedidos de cambio de plan—
              ahora entra por Notificaciones, junto con vencimientos, altas y
              pagos, que es donde se mira todo junto. */}
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:overflow-visible [&::-webkit-scrollbar]:hidden">
            <Link
              href="/admincomerz"
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white md:gap-3"
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              Dashboard
            </Link>
            <Link
              href="/admincomerz/negocios"
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white md:gap-3"
            >
              <Building2 className="h-4 w-4 shrink-0" />
              Comercios
            </Link>
            <Link
              href="/admincomerz/planes"
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white md:gap-3"
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              Planes
            </Link>
          </nav>
        </div>

        {/* En mobile es solo el ícono, alineado a la derecha; el mail y el
            texto entran recién cuando hay una columna donde ponerlos. */}
        <div className="shrink-0 md:border-t md:border-white/10 md:pt-6">
          <div className="mb-2 hidden truncate px-2 text-xs text-white/40 md:block">
            {user.email}
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title={`Cerrar sesión (${user.email})`}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10 md:justify-start"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="max-h-screen flex-1 overflow-y-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
