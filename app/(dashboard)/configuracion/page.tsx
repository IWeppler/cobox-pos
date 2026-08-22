import { getConfiguracionAction } from "@/features/config/actions/config-actions";
import { SettingsManager } from "@/features/config/ui/settings-manager";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import type {
  Permiso,
  PerfilConRol,
  Rol,
  RolPermiso,
} from "@/entities/roles/types";
import type { InvitacionPendiente } from "@/features/config/ui/invitaciones-panel";
import {
  getUsoDelPlanAction,
  type UsoDelPlan,
} from "@/features/planes/actions/uso-del-plan";
import { bloquearVendedor } from "@/shared/config/supabase/guard-rol";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  // Antes esta página solo se protegía desde el middleware: acá adentro
  // `is_admin()` esconde secciones, pero no impedía entrar. Ver `bloquearVendedor`.
  await bloquearVendedor();

  const { data: config, error: configError } = await getConfiguracionAction();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: esAdmin } = await supabase.rpc("is_admin");
  const isAdmin = Boolean(esAdmin);

  // Datos de Empleados y Permisos: solo se cargan si el usuario es
  // admin. RLS ya bloquea la lectura para cualquier otro caso, pero
  // evitamos incluso el intento/exposición de la data en props para
  // usuarios no-admin que lleguen a /configuracion.
  let empleados: PerfilConRol[] = [];
  let roles: Rol[] = [];
  let permisos: Permiso[] = [];
  let rolPermisos: RolPermiso[] = [];
  let invitaciones: InvitacionPendiente[] = [];
  // Uso real de los límites del plan, contado igual que los triggers de la
  // base. Solo para admin: es el único que ve la sección de equipo.
  let uso: UsoDelPlan | null = null;

  if (isAdmin) {
    uso = await getUsoDelPlanAction();
    const [
      empleadosRes,
      rolesRes,
      permisosRes,
      rolPermisosRes,
      invitacionesRes,
    ] = await Promise.all([
        // Los empleados del negocio salen de las membresías, no de perfiles:
        // perfiles es global y un mismo usuario puede estar en otro negocio.
        supabase
          .from("usuarios_negocios")
          .select("usuario_id, rol_id, perfiles(nombre, email), roles(nombre)")
          .order("created_at", { ascending: true }),
        supabase.from("roles").select("id, nombre, es_sistema"),
        supabase
          .from("permisos")
          .select("id, clave, modulo, descripcion")
          .order("modulo", { ascending: true })
          .order("clave", { ascending: true }),
        supabase.from("rol_permisos").select("rol_id, permiso_id"),
        supabase
          .from("invitaciones")
          .select("id, email, expira_en, roles(nombre)")
          .eq("estado", "PENDIENTE")
          .order("created_at", { ascending: false }),
      ]);

    // Se aplana a la forma que ya consume el panel de empleados: id es el del
    // usuario, que es con lo que se edita la membresía.
    empleados = (empleadosRes.data || []).map((fila) => {
      const perfil = Array.isArray(fila.perfiles) ? fila.perfiles[0] : fila.perfiles;
      const rol = Array.isArray(fila.roles) ? fila.roles[0] : fila.roles;
      return {
        id: fila.usuario_id,
        nombre: perfil?.nombre ?? "",
        email: perfil?.email ?? "",
        rol_id: fila.rol_id,
        roles: rol ? { nombre: rol.nombre } : null,
      };
    }) as PerfilConRol[];
    roles = rolesRes.data || [];
    permisos = permisosRes.data || [];
    rolPermisos = rolPermisosRes.data || [];
    invitaciones = (invitacionesRes.data || []).map((inv) => {
      const rol = Array.isArray(inv.roles) ? inv.roles[0] : inv.roles;
      return {
        id: inv.id,
        email: inv.email,
        expira_en: inv.expira_en,
        roles: rol ? { nombre: rol.nombre } : null,
      };
    });
  }

  const { data: promociones } = await supabase
    .from("promociones")
    .select(
      "*, promociones_metodos_pago (metodo_pago), promociones_categorias (categoria_nombre)",
    )
    .order("creado_en", { ascending: false });

  const { data: pagos } = await supabase
    .from("metodos_pago")
    .select("*")
    .order("nombre", { ascending: true });

  const { data: categorias } = await supabase
    .from("categorias")
    .select("*, categoria_atributos(*)")
    .order("nombre", { ascending: true });

  const { data: atributos } = await supabase
    .from("atributos")
    .select("*, atributo_valores(*)")
    .order("nombre", { ascending: true });

  return (
    <div className="space-y-6 mx-auto px-4 p-2">
      {configError || !config ? (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive font-medium">
          {configError ||
            "No se encontró la configuración en la base de datos."}
        </div>
      ) : (
        <SettingsManager
          config={config}
          promociones={promociones || []}
          pagos={pagos || []}
          categorias={categorias || []}
          isAdmin={isAdmin}
          empleados={empleados}
          roles={roles}
          permisos={permisos}
          rolPermisos={rolPermisos}
          invitaciones={invitaciones}
          uso={uso}
        />
      )}
    </div>
  );
}
