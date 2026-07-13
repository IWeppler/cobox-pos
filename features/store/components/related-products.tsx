"use client";

import { Producto } from "@/entities/productos/types";
import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";

interface RelatedProductsProps {
  productos: Producto[];
}

export function RelatedProducts({ productos }: Readonly<RelatedProductsProps>) {
  if (!productos || productos.length === 0) return null;

  return (
    <div className="mt-8 md:mt-24 pt-12 border-t border-border/50">
      <h3 className="text-sm font-bold uppercase tracking-widest text-foreground mb-8 text-center md:text-left">
        También te puede gustar
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {productos.map((producto) => {
          let imagenes: string[] = [];
          if (Array.isArray(producto.imagen_url)) {
            imagenes = producto.imagen_url;
          } else if (typeof producto.imagen_url === "string") {
            try {
              const parsed = JSON.parse(producto.imagen_url);
              imagenes = Array.isArray(parsed) ? parsed : [producto.imagen_url];
            } catch {
              imagenes = [producto.imagen_url];
            }
          }

          const primeraImagen = imagenes[0] || null;
          const linkDestino = producto.slug ? `/store/${producto.slug}` : "#";

          return (
            <Link
              key={producto.id}
              href={linkDestino}
              className="group flex flex-col"
            >
              <div className="relative aspect-[4/5] bg-card w-full overflow-hidden border border-border/40 transition-all group-hover:border-border">
                {primeraImagen ? (
                  <Image
                    src={primeraImagen}
                    alt={producto.nombre || "Producto"}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-muted-foreground opacity-30" />
                  </div>
                )}
              </div>
              <div className="pt-3">
                <h4 className="font-medium text-xs sm:text-sm text-foreground uppercase tracking-wide truncate">
                  {producto.nombre}
                </h4>
                <p className="font-bold text-xs sm:text-sm mt-1">
                  ${(producto.precio || 0).toLocaleString("es-AR")}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
