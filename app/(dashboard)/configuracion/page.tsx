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

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
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

  if (isAdmin) {
    const [empleadosRes, rolesRes, permisosRes, rolPermisosRes] =
      await Promise.all([
        supabase
          .from("perfiles")
          .select("id, nombre, email, rol_id, roles(nombre)")
          .order("nombre", { ascending: true }),
        supabase.from("roles").select("id, nombre, es_sistema"),
        supabase
          .from("permisos")
          .select("id, clave, modulo, descripcion")
          .order("modulo", { ascending: true })
          .order("clave", { ascending: true }),
        supabase.from("rol_permisos").select("rol_id, permiso_id"),
      ]);

    empleados = (empleadosRes.data || []) as unknown as PerfilConRol[];
    roles = rolesRes.data || [];
    permisos = permisosRes.data || [];
    rolPermisos = rolPermisosRes.data || [];
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
        />
      )}
    </div>
  );
}
