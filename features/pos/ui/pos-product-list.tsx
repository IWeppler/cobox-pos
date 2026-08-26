"use client";

import type { Producto } from "@/entities/productos/types";
import { formatearMoneda } from "@/shared/utils/formatters";
import { sufijoPrecioPorUnidad } from "@/shared/lib/unidad-venta";
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeProducto,
  construirUrlProducto,
  esVisibleEnCatalogo,
} from "@/shared/utils/compartir-catalogo";

type PosProductListProps = {
  productos: Producto[];
  stockTotalDe: (producto: Producto) => number;
  permitirVentaSinStock: boolean;
  mostrarSinStock: boolean;
  slugNegocio: string;
  nombreComercio: string;
  onProductoClick: (producto: Producto) => void;
};

/**
 * La grilla del POS en modo LISTA, para los rubros que venden sin mirar fotos
 * (ver `posSinImagenes`).
 *
 * Es la misma información que la card —nombre, precio, si está agotado— en una
 * fila de 44px de alto en vez de una card de 4:3. En un kiosco eso es la
 * diferencia entre ver 8 productos y ver 20 sin scrollear, y el scroll en el
 * mostrador es tiempo con la clienta esperando.
 *
 * El nombre NO se trunca a una línea corta como en la card: acá es lo único
 * que identifica al producto, así que se le da todo el ancho disponible. Un
 * "Gaseosa Cola 2,2..." obligaría a abrir el producto para saber si es la de
 * 2,25 L o la de 1,5 L, que es exactamente lo que esta vista viene a evitar.
 */
export function PosProductList({
  productos,
  stockTotalDe,
  permitirVentaSinStock,
  mostrarSinStock,
  slugNegocio,
  nombreComercio,
  onProductoClick,
}: Readonly<PosProductListProps>) {
  return (
    <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-card pb-20 lg:pb-0">
      {productos.map((producto) => {
        const stockTotal = stockTotalDe(producto);
        const sinStock = stockTotal <= 0;
        const bloqueado = sinStock && !permitirVentaSinStock;

        const urlProducto = producto.slug
          ? construirUrlProducto(slugNegocio, producto.slug)
          : null;
        const compartirDeshabilitado =
          !urlProducto ||
          !esVisibleEnCatalogo(
            { publicado: producto.publicado, stockTotal },
            { mostrarSinStock },
          );

        return (
          <div
            key={producto.id}
            className="group relative flex items-center gap-2 pr-2"
          >
            <button
              onClick={() => onProductoClick(producto)}
              disabled={bloqueado}
              className={`flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                bloqueado
                  ? "opacity-50"
                  : "cursor-pointer hover:bg-muted/60 active:bg-muted"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {producto.nombre}
                </p>
                {sinStock && (
                  <span className="shrink-0 rounded-md border border-danger/20 bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-danger">
                    Agotado
                  </span>
                )}
              </div>

              {/* Tabular para que los precios queden alineados columna abajo:
                  con la lista larga, un precio corrido se lee mal de un
                  vistazo. */}
              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums tracking-tight text-muted-foreground">
                {formatearMoneda(producto.precio)}
                <span className="text-[10px] font-normal">
                  {sufijoPrecioPorUnidad(producto.unidad_medida)}
                </span>
              </p>
            </button>

            <ShareButton
              url={urlProducto ?? ""}
              title={`${producto.nombre} | ${nombreComercio}`}
              text={armarMensajeProducto(
                producto.nombre,
                formatearMoneda(producto.precio),
              )}
              disabled={compartirDeshabilitado}
              disabledReason={
                !urlProducto
                  ? "Este producto no tiene link público"
                  : "Este producto no está visible en el catálogo"
              }
              variant="ghost"
              size="icon-xs"
              className="shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
            />
          </div>
        );
      })}
    </div>
  );
}
