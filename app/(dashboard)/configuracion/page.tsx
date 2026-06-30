import { getConfiguracionAction } from "@/features/config/actions/config-actions";
import { SettingsManager } from "@/features/config/ui/settings-manager";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const { data: config, error: configError } = await getConfiguracionAction();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

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
        />
      )}
    </div>
  );
}
