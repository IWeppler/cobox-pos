import {
  getCatalogoPanelAction,
  type CatalogoPanel,
} from "@/shared/actions/catalogo-panel";
import { getCatalogoDeltaAction } from "@/shared/actions/catalogo-delta";
import { mergearCatalogo } from "@/shared/lib/merge-catalogo";

export type RespuestaCatalogo = {
  data: CatalogoPanel | null;
  error: string | null;
};

/**
 * La decisión de CÓMO traer el catálogo: entero o solo lo que cambió.
 *
 * POR QUÉ IMPORTA. El catálogo completo se baja 6.849 veces por día a ~245 kB
 * comprimidos: ~1,68 GB diarios, el grueso del egress del proyecto. Un delta de
 * 24 h son 56 productos y 133 kB; uno de una hora, cero bytes de productos.
 *
 * LA REGLA ES UNA SOLA: si hay copia local CON cursor, delta; si no, completo.
 * No hay heurística de "cada tantas veces bajá todo" ni tiempo máximo del lado
 * del cliente, y es a propósito — quién puede sincronizar por delta lo decide
 * el SERVIDOR, que es el único que sabe hasta dónde llegan los avisos de baja
 * (`catalogo_borrados`). Cuando el cursor es más viejo que esa retención, la
 * respuesta viene con `completo: true` y el merge reemplaza en vez de mergear.
 *
 * SIN CURSOR TAMBIÉN ES COMPLETO, y ese es el caso de las copias guardadas por
 * la versión anterior de la app: quedaron sin `cursor` en IndexedDB, así que la
 * primera apertura después de este cambio baja todo una vez y a partir de ahí
 * sincroniza por delta. No hace falta migrar ni invalidar nada.
 *
 * SI EL DELTA FALLA, LANZA en vez de devolver `{ error }`. La diferencia se ve
 * en la pantalla: lanzando, React Query conserva el catálogo anterior y su
 * `dataUpdatedAt`, así que el aviso de "Precios y stock — actualizados hace X"
 * sigue diciendo la verdad. Devolviendo el catálogo viejo con error null,
 * `dataUpdatedAt` saltaría a ahora y la pantalla juraría estar al día con
 * precios de ayer. Un precio viejo que se sabe viejo se puede trabajar; uno que
 * miente se cobra.
 */
export async function sincronizarCatalogo(
  anterior: CatalogoPanel | null | undefined,
): Promise<RespuestaCatalogo> {
  if (!anterior?.cursor) return getCatalogoPanelAction();

  const { data, error } = await getCatalogoDeltaAction(anterior.cursor);

  if (error || !data) {
    throw new Error(error ?? "No se pudo sincronizar el catálogo.");
  }

  return { data: mergearCatalogo(anterior, data), error: null };
}
