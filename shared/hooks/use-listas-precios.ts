"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/shared/config/supabase/client";
import { conNegocio, queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { precioDeLista, type PrecioResuelto } from "@/shared/lib/precio-de-lista";
import type { ListaPrecio } from "@/entities/precios/types";

/**
 * Las listas de precios del negocio, para el POS.
 *
 * UNA SOLA ENTRADA para los dos componentes que las necesitan: la grilla
 * (`PosTerminal`, que pone el precio al agregar al carrito) y el ticket
 * (`CartPanelAdmin`, que muestra el selector y re-precia). Son hermanos, no
 * padre e hijo, así que sin una fuente compartida serían dos consultas — y dos
 * consultas a la misma tabla son dos momentos distintos: si una lista se apaga
 * entre una y otra, la grilla cobraría con una lista que el ticket ya no
 * tiene. Es el mismo argumento que ya está escrito en
 * `descuentos-pago-provider.tsx` para las promociones.
 *
 * QUÉ SE TRAE Y QUÉ NO. Las listas ACTIVAS (dos filas) y los precios fijos
 * (`producto_precios`), que por diseño son solo las excepciones a la regla: un
 * comercio cuya lista mayorista es "todo −20%" no tiene ni una fila. Por eso
 * se traen enteros y no filtrados por el carrito — pesan kilobytes contra los
 * ~2 MB del catálogo, y tenerlos completos permite preciar una línea nueva sin
 * ir a la red con la clienta en el mostrador.
 *
 * Si el negocio no tiene listas —7 de los 8 hoy— esto devuelve dos arrays
 * vacíos y el POS no dibuja nada.
 */

export interface ListasPreciosPos {
  listas: ListaPrecio[];
  /** `overrides[listaId][productoId] = precio fijo`. */
  overrides: Record<string, Record<string, number>>;
}

const VACIO: ListasPreciosPos = { listas: [], overrides: {} };

/** Cambian desde Configuración, no desde el mostrador: no hace falta refrescarlas seguido. */
const STALE_TIME_MS = 5 * 60 * 1000;

export function useListasPrecios() {
  const negocioActivo = useNegocioActivo();
  const negocioId = negocioActivo?.id ?? null;

  const { data } = useQuery({
    queryKey: conNegocio(queryKeys.listasPrecios, negocioId),
    queryFn: async (): Promise<ListasPreciosPos> => {
      const supabase = createClient();

      const [{ data: listas }, { data: fijos }] = await Promise.all([
        supabase
          .from("listas_precios")
          .select("id, nombre, tipo_regla, valor, admite_promociones, activa")
          // Una lista apagada no se puede elegir. `precioDeLista` igual la
          // cortaría (motivo LISTA_INACTIVA), pero ofrecerla en el selector
          // para que después no haga nada es peor que no ofrecerla.
          .eq("activa", true)
          .order("nombre", { ascending: true }),
        supabase.from("producto_precios").select("lista_id, producto_id, precio"),
      ]);

      const overrides: Record<string, Record<string, number>> = {};
      for (const fila of fijos ?? []) {
        const porLista = (overrides[fila.lista_id] ??= {});
        porLista[fila.producto_id] = Number(fila.precio);
      }

      return { listas: (listas ?? []) as ListaPrecio[], overrides };
    },
    staleTime: STALE_TIME_MS,
    // Sin negocio resuelto no se pregunta nada: sería una consulta que la RLS
    // devuelve vacía y que habría que volver a hacer igual.
    enabled: Boolean(negocioId),
  });

  const listas = data?.listas ?? VACIO.listas;
  const overrides = data?.overrides ?? VACIO.overrides;

  const listaPorId = useMemo(
    () => new Map(listas.map((lista) => [lista.id, lista])),
    [listas],
  );

  /**
   * El precio de una unidad con la lista elegida.
   *
   * Es la MISMA función que corre en el server (`precioDeLista`); acá solo se
   * le acercan los datos. Un id de lista que no está en el mapa —apagada,
   * borrada, de otro negocio— cae al precio base, igual que en `create-sale`.
   */
  const resolver = useCallback(
    (args: {
      listaPrecioId: string | null;
      productoId: string;
      precioBase: number;
      precioCosto?: number | null;
    }): PrecioResuelto => {
      const lista = args.listaPrecioId
        ? (listaPorId.get(args.listaPrecioId) ?? null)
        : null;

      return precioDeLista({
        precioBase: args.precioBase,
        precioCosto: args.precioCosto,
        lista,
        override: lista
          ? (overrides[lista.id]?.[args.productoId] ?? null)
          : null,
      });
    },
    [listaPorId, overrides],
  );

  // `overrides` sale para la pantalla que los EDITA (la ficha del producto en
  // Inventario). El POS no lo necesita: usa `resolver`, que ya los cruza.
  return {
    listas,
    listaPorId,
    overrides,
    resolver,
    hayListas: listas.length > 0,
  };
}
