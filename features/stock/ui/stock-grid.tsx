"use client";

import Image from "next/image";
import type { Producto } from "@/entities/productos/types";
import { Image as ImageIcon } from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";
import {
  capitalizar,
  getTotalStock,
  obtenerPrimeraImagen,
} from "../lib/stock-product-utils";
import { ProductEditDetailSheet } from "./edit-sheet";
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeProducto,
  construirUrlProducto,
  esVisibleEnCatalogo,
} from "@/shared/utils/compartir-catalogo";

interface StockGridProps {
  productos: Producto[];
  userRole: string;
  nombreComercio: string;
  mostrarSinStock: boolean;
}

export function StockGrid({
  productos,
  nombreComercio,
  mostrarSinStock,
}: Readonly<StockGridProps>) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (productos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No hay productos que coincidan con la búsqueda.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 m-2">
      {productos.map((producto) => {
        const primeraImagen = obtenerPrimeraImagen(producto.imagen_url);
        const urlProducto = producto.slug
          ? construirUrlProducto(baseUrl, producto.slug)
          : null;
        const compartirDeshabilitado =
          !urlProducto ||
          !esVisibleEnCatalogo(
            {
              publicado: producto.publicado,
              stockTotal: getTotalStock(producto),
            },
            { mostrarSinStock },
          );
        const motivoCompartirDeshabilitado = !urlProducto
          ? "Este producto no tiene link público"
          : "Este producto no está visible en el catálogo";

        return (
          <div key={producto.id} className="flex flex-col group relative">
            <div className="relative aspect-4/5 bg-muted/30 rounded-xl overflow-hidden mb-3 border border-border/40 transition-all group-hover:border-border">
              <ProductEditDetailSheet
                producto={producto}
                nombreComercio={nombreComercio}
                mostrarSinStock={mostrarSinStock}
              >
                <div className="w-full h-full cursor-pointer">
                  {primeraImagen ? (
                    <Image
                      src={primeraImagen}
                      alt={producto.nombre}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground opacity-30" />
                    </div>
                  )}
                </div>
              </ProductEditDetailSheet>

              <ShareButton
                url={urlProducto ?? ""}
                title={`${producto.nombre} | ${nombreComercio}`}
                text={armarMensajeProducto(
                  producto.nombre,
                  formatearMoneda(producto.precio),
                )}
                disabled={compartirDeshabilitado}
                disabledReason={motivoCompartirDeshabilitado}
                variant="secondary"
                size="icon-sm"
                className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm shadow-sm hover:bg-background"
              />
            </div>

            <div className="px-1 flex flex-col">
              <div className="flex justify-between items-start gap-2">
                <h3
                  className="font-semibold text-sm leading-tight text-foreground truncate"
                  title={producto.nombre}
                >
                  {producto.nombre}
                </h3>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                {capitalizar(producto.tipo)}
              </p>
              <p className="font-bold text-sm mt-1 text-foreground">
                {formatearMoneda(producto.precio)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
