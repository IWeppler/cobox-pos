import { getProductosSinFotoAction } from "@/features/stock/actions/get-productos-sin-foto";
import { FotosPendientesClient } from "@/features/stock/ui/fotos-pendientes-client";
import { bloquearVendedor } from "@/shared/config/supabase/guard-rol";

export const dynamic = "force-dynamic";

export default async function FotosPendientesPage() {
  await bloquearVendedor();

  const { productos, total, error } = await getProductosSinFotoAction();

  if (error) {
    return (
      <div className="m-2 rounded-xl bg-danger/10 p-8 text-center font-bold text-danger md:m-4">
        {error}
      </div>
    );
  }

  return <FotosPendientesClient productosIniciales={productos} total={total} />;
}
