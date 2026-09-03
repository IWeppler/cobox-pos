import { StockSkeleton } from "@/features/stock/ui/stock-skeleton";

/**
 * Lo que se ve APENAS se clickea Inventario en el sidebar.
 *
 * QUÉ ARREGLA, medido antes de existir: `/pos → /stock` dejaba la pantalla
 * anterior CONGELADA 863 ms —sin que se iluminara siquiera el ítem del
 * sidebar— y recién a los 2.531 ms había tabla. Nada de eso era red lenta: el
 * ítem no se ilumina porque `usePathname()` solo cambia cuando la navegación
 * commitea, y sin loading boundary Next no commitea hasta tener la página
 * entera resuelta.
 *
 * Con este archivo la navegación commitea al instante: el sidebar marca
 * Inventario en el click y acá aparece el esqueleto. El tiempo hasta los datos
 * no baja —eso lo atacan el middleware y las consultas— pero deja de ser
 * tiempo en el que la app parece colgada.
 *
 * Efecto secundario que importa: con un loading boundary, el prefetch de Next
 * pasa a tener algo que precargar. Medido antes, el prefetch de estas rutas
 * devolvía 0,2-1,5 kB de pura cáscara de ruteo, o sea que no compraba nada.
 *
 * `mt-8` y el resto de las clases salen de StockSkeleton, que es EL MISMO
 * componente que usa el estado de carga del cliente: cuando el server
 * component resuelve y monta `StockPageClient`, si el catálogo todavía no
 * llegó se sigue dibujando esto mismo. La transición no se ve.
 */
export default function Loading() {
  return (
    <div className="space-y-6 mx-auto px-2 md:px-4">
      <StockSkeleton />
    </div>
  );
}
