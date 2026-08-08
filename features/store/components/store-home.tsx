"use client";

import Image from "next/image";
import { ArrowRight, ImageOff } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { Producto } from "@/entities/productos/types";
import type { EntradaPortada } from "../lib/portada-catalogo";
import { ProductCard } from "./product-card";
import { CarruselHorizontal } from "./carrusel-horizontal";

/**
 * Portada del catálogo: categorías + recién llegados.
 *
 * Reemplaza a la grilla completa con filtros que se mostraba de entrada. La
 * idea es que el visitante primero elija POR DÓNDE entrar; los filtros de
 * talle y color aparecen adentro de la categoría, donde ya son una lista
 * legible en vez del inventario entero.
 */
export function StoreHome({
  categorias,
  recientes,
  totalProductos,
  onSelectCategoria,
  onVerTodo,
}: Readonly<{
  categorias: EntradaPortada[];
  recientes: Producto[];
  totalProductos: number;
  onSelectCategoria: (id: string) => void;
  onVerTodo: () => void;
}>) {
  return (
    <div className="space-y-14">
      {categorias.length > 0 && (
        <section aria-labelledby="portada-categorias">
          <div className="flex items-end justify-between gap-4 mb-5">
            <h2
              id="portada-categorias"
              className="text-lg sm:text-xl font-semibold tracking-tight text-foreground"
            >
              Categorías
            </h2>
            <button
              type="button"
              onClick={onVerTodo}
              className="text-xs uppercase tracking-widest font-bold text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
            >
              Ver todo
            </button>
          </div>

          {/* Fila scrollable y no grilla: con una cantidad impar de categorías
              la grilla dejaba un cuadrante vacío, que se lee como si faltara
              algo. Un carrusel se ve completo con 3, 5 o 7 por igual. En
              mobile se arrastra; en desktop el carrusel pone flechas. */}
          <CarruselHorizontal ariaLabel="categorías">
            {categorias.map((categoria) => (
              <div
                key={categoria.id}
                className="snap-start shrink-0 w-40 sm:w-52 lg:w-56"
              >
                <button
                  type="button"
                  onClick={() => onSelectCategoria(categoria.id)}
                  className="group relative w-full aspect-[4/5] overflow-hidden rounded-xl border border-border/50 bg-card text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {categoria.imagen ? (
                    <Image
                      src={categoria.imagen}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 40vw, 224px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <ImageOff
                        className="w-8 h-8 text-muted-foreground/40"
                        strokeWidth={1.5}
                      />
                    </div>
                  )}

                  {/* Degradado sólo abajo: el nombre tiene que leerse sobre
                      cualquier foto, sin tapar el producto entero. */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3 sm:p-4">
                    <p className="text-sm sm:text-base font-semibold text-white leading-tight">
                      {categoria.nombre}
                    </p>
                    <p className="text-[11px] text-white/75 mt-0.5">
                      {categoria.count}{" "}
                      {categoria.count === 1 ? "producto" : "productos"}
                    </p>
                  </div>
                </button>
              </div>
            ))}
          </CarruselHorizontal>
        </section>
      )}

      {recientes.length > 0 && (
        <section aria-labelledby="portada-recientes">
          <div className="flex items-end justify-between gap-4 mb-5">
            <h2
              id="portada-recientes"
              className="text-lg sm:text-xl font-semibold tracking-tight text-foreground"
            >
              Recién llegados
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12">
            {recientes.map((producto, index) => (
              <ProductCard
                key={producto.id}
                producto={producto}
                priority={index < 4}
              />
            ))}
          </div>
        </section>
      )}

      {/* Salida explícita a la grilla completa: es la única forma de llegar a
          los filtros globales ahora que la home no los muestra. */}
      <div className="flex justify-center pt-2 pb-8">
        <Button
          variant="outline"
          size="lg"
          onClick={onVerTodo}
          className="w-full sm:w-auto font-bold rounded-none border-border shadow-none text-foreground px-12 uppercase tracking-widest text-xs h-14 cursor-pointer"
        >
          Ver los {totalProductos} productos
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
