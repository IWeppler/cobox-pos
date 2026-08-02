import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProfileDashboard } from "@/features/perfil/ui/profile-dashboard";
import { createClient } from "@/shared/config/supabase/server";
import { getPlanDelNegocioAction } from "@/features/admin/actions/planes-actions";

export const dynamic = "force-dynamic";

const ProfilePage = async () => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // La página venía con todo en blanco (id, nombre, email y plan hardcodeados
  // en ""). Ahora sale del perfil global y del negocio activo.
  const [{ data: perfil }, plan] = await Promise.all([
    supabase.from("perfiles").select("nombre, email").eq("id", user.id).single(),
    getPlanDelNegocioAction(),
  ]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-2 md:p-4 md:pl-0 h-screen">
      <ProfileDashboard
        usuario={{
          id: user.id,
          nombre: perfil?.nombre ?? "",
          email: perfil?.email ?? user.email ?? "",
        }}
        plan={plan}
      />
    </div>
  );
};

export default ProfilePage;
