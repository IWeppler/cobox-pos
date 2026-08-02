import { ItemResuelto, SugerenciaSimilitud } from "@/entities/compras/types";
import { Producto } from "@/entities/productos/types";
import { getOrdenParaMergeAction } from "@/features/purchases/actions/merge-purchase";
import { MergeTable } from "@/features/purchases/ui/merge-table";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MergePage({ params }: Readonly<PageProps>) {
  const { id } = await params;

  const { orden, items, productos, sugerenciasSimilitud, error } =
    await getOrdenParaMergeAction(id);

  if (error || !orden) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl font-bold">
        {error || "Orden no encontrada."}
      </div>
    );
  }

  if (orden.estado === "APROBADA") {
    return (
      <div className="p-8 text-center bg-success/10 text-success rounded-xl font-bold m-2 md:m-4">
        Esta orden de compra ya fue procesada e impactada en el stock.
      </div>
    );
  }

  return (
    <div className="w-full mx-auto pb-12">
      <MergeTable
        orden={orden}
        itemsOriginales={items as ItemResuelto[]}
        productos={productos as Producto[]}
        sugerenciasSimilitud={sugerenciasSimilitud as SugerenciaSimilitud[]}
      />
    </div>
  );
}
