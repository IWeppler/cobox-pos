import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProfileDashboard } from "@/features/perfil/ui/profile-dashboard";
import { createClient } from "@/shared/config/supabase/server";
import {
  getPlanDelNegocioAction,
  getPlanesCompletosAction,
} from "@/features/admin/actions/planes-actions";
import { getUsoDelPlanAction } from "@/features/planes/actions/uso-del-plan";
import { SuscripcionPanel } from "@/features/planes/ui/suscripcion/suscripcion-panel";

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
  //
  // Las cuatro consultas van en paralelo: la pestaña de suscripción necesita
  // el plan del negocio, la lista de planes activos (para la comparativa) y el
  // uso real de los límites, y ninguna depende de otra.
  const [{ data: perfil }, plan, planes, uso] = await Promise.all([
    supabase.from("perfiles").select("nombre, email").eq("id", user.id).single(),
    getPlanDelNegocioAction(),
    getPlanesCompletosAction(),
    getUsoDelPlanAction(),
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
        suscripcion={
          <SuscripcionPanel plan={plan} planes={planes} uso={uso} />
        }
      />
    </div>
  );
};

export default ProfilePage;
