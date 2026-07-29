"use client";

import Image from "next/image";
import type { ProductoIndice } from "@/entities/productos/types";
import { Image as ImageIcon } from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";
import {
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
import {
  resolverCategoriaDisplayLabel,
  type CategoriaBase,
} from "@/shared/utils/category-tree";
import { badgesIdentidad } from "../lib/identidad-por-rubro";
import type { Rubro } from "@/entities/config/types";

interface StockGridProps {
  productos: ProductoIndice[];
  userRole: string;
  nombreComercio: string;
  mostrarSinStock: boolean;
  /** Categorías reales (con parent_id) para armar el label combinado
   * "Padre › Hijo" de cada producto — mismo fetch que stock-view.tsx ya usa
   * para los chips, no uno nuevo. */
  categorias: CategoriaBase[];
  /** indumentaria -> badge "N var."; electro -> Modelo + EAN. */
  rubro: Rubro;
}

export function StockGrid({
  productos,
  nombreComercio,
  mostrarSinStock,
  categorias,
  rubro,
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
      {productos.map((producto, index) => {
        // grid_url (320px) es la fuente correcta para esta celda de
        // ~230-400px CSS en tablet — thumbnail_url (150px) queda corto y
        // sale borroso al upscalear (ver diagnóstico de borrosidad).
        // thumbnail_url/imagen_url quedan solo de fallback para productos
        // viejos sin backfill de grid_url.
        const primeraImagen =
          obtenerPrimeraImagen(producto.grid_url) ??
          obtenerPrimeraImagen(producto.thumbnail_url) ??
          obtenerPrimeraImagen(producto.imagen_url);
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
        const categoriaLabel = resolverCategoriaDisplayLabel(
          categorias,
          producto.categoria_id,
        );

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
                      // Alineado a los breakpoints reales de la grilla de
                      // acá abajo (grid-cols-2 / md:grid-cols-3 /
                      // lg:grid-cols-4) — antes pedía 50vw/33vw con cortes
                      // en 768/1200px que no coincidían con dónde la grilla
                      // realmente cambia de columnas (768/1024px).
                      sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                      priority={index < 8}
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
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {producto.marca && (
                  <span className="text-[9px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50 w-fit truncate max-w-full">
                    {producto.marca}
                  </span>
                )}
                {badgesIdentidad(
                  producto,
                  producto.producto_variantes ?? [],
                  rubro,
                ).map((badge) => (
                  <span
                    key={badge.clave}
                    title={badge.titulo}
                    className="text-[9px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50 w-fit truncate max-w-full"
                  >
                    {badge.texto}
                  </span>
                ))}
              </div>
              <p
                className="text-[11px] text-muted-foreground mt-0.5 truncate"
                title={categoriaLabel || undefined}
              >
                {categoriaLabel}
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
