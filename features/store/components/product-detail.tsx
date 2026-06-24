"use client";

import { useState, useMemo } from "react";
import { Producto } from "@/entities/productos/types";
import {
  ShoppingBag,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  ChevronDown,
  Info,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCartStore } from "@/shared/store/cart-store";
import { toast } from "sonner";
import { ConfiguracionPOS } from "@/entities/config/types";

interface ProductDetailProps {
  producto: Producto;
  baseUrl?: string;
  numeroWhatsApp?: string;
  config?: ConfiguracionPOS | any;
}

export function ProductDetail({
  producto,
  config,
}: Readonly<ProductDetailProps>) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [descOpen, setDescOpen] = useState(false);

  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const [errorVariante, setErrorVariante] = useState(false);

  const addItem = useCartStore((state) => state.addItem);

  const imagenes = useMemo(() => {
    if (Array.isArray(producto.imagen_url)) return producto.imagen_url;
    if (typeof producto.imagen_url === "string") {
      try {
        const parsed = JSON.parse(producto.imagen_url);
        return Array.isArray(parsed) ? parsed : [producto.imagen_url];
      } catch {
        return [producto.imagen_url];
      }
    }
    return [];
  }, [producto.imagen_url]);

  const variantesArray = useMemo(() => {
    const list: Array<{ variante: string; cantidad: number; id_real: string }> =
      [];
    producto.producto_variantes?.forEach((v) => {
      list.push({
        variante: v.nombre_display,
        cantidad: v.stock,
        id_real: v.id,
      });
    });
    producto.stock?.forEach((s) => {
      list.push({ variante: s.variante, cantidad: s.cantidad, id_real: s.id });
    });
    return list;
  }, [producto.producto_variantes, producto.stock]);

  const stockTotal = useMemo(
    () => variantesArray.reduce((acc, s) => acc + s.cantidad, 0),
    [variantesArray],
  );
  const estaAgotado = stockTotal === 0;

  const parsedVariants = useMemo(() => {
    const props: Record<string, Set<string>> = {};
    let isLegacy = false;
    let isLegacySplit = false;

    variantesArray.forEach((s) => {
      const v = s.variante || "";
      if (v.toLowerCase() === "unico" || v.toLowerCase() === "único") return;

      if (v.includes(":")) {
        v.split("|").forEach((part) => {
          const [key, val] = part.split(":");
          if (key && val) {
            if (!props[key]) props[key] = new Set();
            props[key].add(val.trim());
          }
        });
      } else if (v.includes("/") || v.includes("-")) {
        isLegacySplit = true;
        const separator = v.includes("/") ? "/" : "-";
        v.split(separator).forEach((part, idx) => {
          const key =
            idx === 0 ? "Color" : idx === 1 ? "Talle" : `Opción ${idx + 1}`;
          if (!props[key]) props[key] = new Set();
          props[key].add(part.trim());
        });
      } else {
        isLegacy = true;
        if (!props["Opción"]) props["Opción"] = new Set();
        props["Opción"].add(v.trim());
      }
    });

    const result: Record<string, string[]> = {};
    Object.keys(props).forEach((k) => {
      result[k] = Array.from(props[k]);
    });
    return { properties: result, isLegacy, isLegacySplit };
  }, [variantesArray]);

  const isUnico = Object.keys(parsedVariants.properties).length === 0;

  // LÓGICA DE DISPONIBILIDAD CRUZADA (Para tachar botones incompatibles)
  const isOptionAvailable = (propName: string, val: string) => {
    const testSelections = { ...selecciones, [propName]: val };

    return variantesArray.some((s) => {
      if (s.cantidad <= 0) return false;
      const v = s.variante || "";

      if (
        parsedVariants.isLegacySplit &&
        (v.includes("/") || v.includes("-"))
      ) {
        const separator = v.includes("/") ? "/" : "-";
        const parts = v.split(separator).map((p) => p.trim());
        return Object.entries(testSelections).every(([k, selVal]) => {
          const idx =
            k === "Color"
              ? 0
              : k === "Talle"
                ? 1
                : parseInt(k.replace("Opción ", "")) - 1;
          return parts[idx] === selVal;
        });
      }

      if (parsedVariants.isLegacy) return v.trim() === val;

      const variantParts = v.split("|");
      return Object.entries(testSelections).every(([k, selVal]) =>
        variantParts.includes(`${k}:${selVal}`),
      );
    });
  };

  const handleAddToCart = () => {
    if (estaAgotado) return;

    if (
      !isUnico &&
      Object.keys(parsedVariants.properties).length !==
        Object.keys(selecciones).length
    ) {
      setErrorVariante(true);
      return;
    }
    setErrorVariante(false);

    // Buscar el stock que coincida
    const stockDeVariante = variantesArray.find((s) => {
      if (isUnico) return true;
      const v = s.variante || "";

      if (
        parsedVariants.isLegacySplit &&
        (v.includes("/") || v.includes("-"))
      ) {
        const separator = v.includes("/") ? "/" : "-";
        const parts = v.split(separator).map((p) => p.trim());
        return Object.entries(selecciones).every(([k, selVal]) => {
          const idx =
            k === "Color"
              ? 0
              : k === "Talle"
                ? 1
                : parseInt(k.replace("Opción ", "")) - 1;
          return parts[idx] === selVal;
        });
      }

      if (parsedVariants.isLegacy) return v.trim() === selecciones["Opción"];

      const variantParts = v.split("|");
      return Object.entries(selecciones).every(([k, selVal]) =>
        variantParts.includes(`${k}:${selVal}`),
      );
    });

    const stockMaximo = stockDeVariante ? stockDeVariante.cantidad : 0;

    if (stockMaximo <= 0) {
      toast.error("Esta combinación se encuentra agotada.");
      return;
    }

    addItem({
      productoId: producto.id,
      nombre: producto.nombre || "Sin nombre",
      tipo: producto.tipo || "",
      variante: stockDeVariante ? stockDeVariante.variante : "Unico",
      precio: producto.precio,
      cantidad: 1,
      imagenUrl: imagenes[0] || null,
      stockMaximo: stockMaximo,
    });

    toast.success("Añadido al carrito de compras");
  };

  const handlePrevImage = () =>
    setCurrentImageIndex((prev) =>
      prev === 0 ? imagenes.length - 1 : prev - 1,
    );
  const handleNextImage = () =>
    setCurrentImageIndex((prev) =>
      prev === imagenes.length - 1 ? 0 : prev + 1,
    );

  return (
    <div className="flex flex-col md:flex-row items-start mx-4 pb-8 md:pb-0 relative">
      {/* LADO IZQUIERDO: IMÁGENES */}
      <div className="w-full md:w-[55%] lg:w-[60%] flex flex-col md:pr-8 lg:pr-12 md:sticky md:top-32">
        {/* Breadcrumb Oculto en Mobile, visible en Desktop */}
        <nav className="hidden md:flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-6">
          <Link
            href="/store"
            className="hover:text-foreground transition-colors"
          >
            Catálogo
          </Link>
          <span className="mx-2 opacity-50">/</span>
          {producto.tipo && (
            <>
              <Link
                href={`/store?q=${producto.tipo}`}
                className="hover:text-foreground transition-colors"
              >
                {producto.tipo}
              </Link>
              <span className="mx-2 opacity-50">/</span>
            </>
          )}
          <span className="text-foreground truncate max-w-50">
            {producto.nombre}
          </span>
        </nav>

        {/* Breadcrumb visible solo en Mobile */}
        <nav className="flex md:hidden items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground my-4">
          <Link href="/store" className="hover:text-foreground">
            Catálogo
          </Link>
          <span className="mx-2 opacity-50">/</span>
          {producto.tipo && (
            <span className="text-foreground truncate max-w-50">
              {producto.tipo}
            </span>
          )}
        </nav>

        {/* Galería Mobile (Swipeable) */}
        <div className="md:hidden flex overflow-x-auto snap-x snap-mandatory scrollbar-hide w-full bg-[#f7f7f7]">
          {imagenes.length > 0 ? (
            imagenes.map((img, i) => (
              <div
                key={i}
                className="snap-center shrink-0 w-full aspect-4/5 relative"
              >
                <Image
                  src={img}
                  alt={`${producto.nombre} ${i}`}
                  fill
                  className="object-cover"
                  priority={i === 0}
                  sizes="100vw"
                />
                {imagenes.length > 1 && (
                  <div className="absolute bottom-4 left-0 w-full flex justify-center gap-1.5">
                    {imagenes.map((_, dotIdx) => (
                      <div
                        key={dotIdx}
                        className={`w-1.5 h-1.5 rounded-full ${dotIdx === i ? "bg-black" : "bg-black/20"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="snap-center shrink-0 w-full aspect-4/5 flex flex-col items-center justify-center text-muted-foreground/30">
              <ShoppingBag className="w-16 h-16 mb-2" strokeWidth={1} />
            </div>
          )}
        </div>

        {/* Galería Desktop (Imagen principal + Miniaturas) */}
        <div className="hidden md:flex flex-col gap-3">
          <div className="relative aspect-4/5 bg-[#f7f7f7] w-full flex items-center justify-center group overflow-hidden border border-border/60">
            {imagenes.length > 0 ? (
              <Image
                src={imagenes[currentImageIndex]}
                alt={producto.nombre || ""}
                fill
                className="object-cover transition-opacity duration-300"
                priority
                sizes="(max-width: 1200px) 50vw, 33vw"
              />
            ) : (
              <ShoppingBag
                className="w-20 h-20 text-muted-foreground/30"
                strokeWidth={1}
              />
            )}
            {imagenes.length > 1 && (
              <>
                <button
                  onClick={handlePrevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white hover:bg-neutral-100 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 border border-border cursor-pointer shadow-sm"
                >
                  <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
                </button>
                <button
                  onClick={handleNextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white hover:bg-neutral-100 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 border border-border cursor-pointer shadow-sm"
                >
                  <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
          {imagenes.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mt-2">
              {imagenes.map((img, index) => (
                <button
                  key={`thumb-${index}`}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`relative w-20 h-28 shrink-0 bg-[#f7f7f7] transition-all border cursor-pointer ${currentImageIndex === index ? "border-foreground opacity-100" : "border-transparent opacity-60 hover:opacity-100 hover:border-border"}`}
                >
                  <Image
                    src={img}
                    alt={`Thumb ${index}`}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* LADO DERECHO: INFORMACIÓN Y CTA */}
      <div className="w-full md:w-[45%] lg:w-[40%] flex flex-col pt-4 sm:px-0">
        <h1 className="text-2xl md:text-4xl font-semibold text-foreground uppercase tracking-tight mb-2 md:mb-4">
          {producto.nombre}
        </h1>

        {config?.mostrar_precios !== false && (
          <div className="text-xl md:text-2xl font-medium text-foreground mb-6 md:mb-8">
            ${(producto.precio || 0).toLocaleString("es-AR")}
          </div>
        )}

        {config?.pedidos_whatsapp !== false ? (
          <>
            {/* 🚀 RENDER MULTIDIMENSIONAL DE VARIANTES (Se auto-generan botones por cada Atributo) */}
            {!isUnico && (
              <div className="mb-6 space-y-5">
                {Object.entries(parsedVariants.properties).map(
                  ([propName, values]) => (
                    <div key={propName}>
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                        Selecciona {propName}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {values.map((val) => {
                          const isSelected = selecciones[propName] === val;
                          const hasStock = isOptionAvailable(propName, val);

                          return (
                            <button
                              key={val}
                              type="button"
                              disabled={!hasStock}
                              onClick={() => {
                                setSelecciones((prev) => ({
                                  ...prev,
                                  [propName]: val,
                                }));
                                setErrorVariante(false);
                              }}
                              className={`min-w-16 px-4 py-3 text-[10px] sm:text-xs font-semibold uppercase transition-all border ${
                                isSelected
                                  ? "border-foreground bg-foreground text-background cursor-pointer"
                                  : hasStock
                                    ? "border-border/60 bg-transparent text-foreground hover:border-foreground cursor-pointer"
                                    : "border-border/30 bg-transparent text-muted-foreground opacity-40 cursor-not-allowed line-through decoration-muted-foreground/40"
                              }`}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}

                {errorVariante && (
                  <p className="text-rose-600 text-xs font-bold tracking-wide flex items-center animate-in fade-in slide-in-from-top-1">
                    <AlertCircle className="w-3.5 h-3.5 mr-1.5" /> Faltan
                    opciones por seleccionar
                  </p>
                )}
              </div>
            )}

            {producto.descripcion && (
              <div className="border-t border-border/60 py-4 mt-2">
                <button
                  onClick={() => setDescOpen(!descOpen)}
                  className="flex justify-between items-center w-full text-[10px] font-bold uppercase tracking-widest text-foreground cursor-pointer"
                >
                  <span>Descripción del Producto</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 ${descOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-in-out ${descOpen ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {producto.descripcion}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="hidden md:block border-t border-border/60 pt-6 mt-4">
              <button
                onClick={handleAddToCart}
                disabled={estaAgotado}
                className={`w-full flex items-center justify-center gap-3 py-4 rounded-none font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer ${
                  estaAgotado
                    ? "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                    : "bg-neutral-950 hover:bg-neutral-800 text-white"
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                {estaAgotado ? "Agotado" : "Añadir al carrito"}
              </button>
            </div>
          </>
        ) : (
          /* MODO SOLO VISUALIZACIÓN */
          <>
            {producto.descripcion && (
              <div className="border-t border-border/60 py-4 mt-2">
                <button
                  onClick={() => setDescOpen(!descOpen)}
                  className="flex justify-between items-center w-full text-[10px] font-bold uppercase tracking-widest text-foreground cursor-pointer"
                >
                  <span>Descripción del Producto</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 ${descOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-in-out ${descOpen ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {producto.descripcion}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-border/60 py-6 mt-2">
              <div className="bg-muted/50 border border-border/50 p-4 flex flex-col items-center justify-center gap-2">
                <Info className="w-5 h-5 text-muted-foreground mb-1" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">
                  Modo Catálogo
                </span>
                <span className="text-xs text-muted-foreground text-center max-w-60">
                  Para consultar stock o realizar un pedido, contactanos
                  directamente.
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {config?.pedidos_whatsapp !== false && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-border z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <button
            onClick={handleAddToCart}
            disabled={estaAgotado}
            className={`w-full flex items-center justify-center gap-3 py-4 rounded-none font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer ${
              estaAgotado
                ? "bg-muted text-muted-foreground cursor-not-allowed border border-border"
                : "bg-neutral-950 text-white"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            {estaAgotado ? "Agotado" : "Añadir al carrito"}
          </button>
        </div>
      )}
    </div>
  );
}
