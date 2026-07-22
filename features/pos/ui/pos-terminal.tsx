"use client";

import { useMemo, useState } from "react";
import { Producto } from "@/entities/productos/types";
import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/shared/store/cart-store";
import { toast } from "sonner";
import { useCatalogFilters } from "@/features/store/hooks/use-catalog-filters";
import { QuickAddModal } from "@/features/pos/ui/quick-add-modal";
import Image from "next/image";
import { StockFiltersToolbar } from "@/features/stock/ui/stock-filters-toolbar";
import { formatearMoneda } from "@/shared/utils/formatters";
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeProducto,
  construirUrlProducto,
  esVisibleEnCatalogo,
} from "@/shared/utils/compartir-catalogo";

interface PosTerminalProps {
  productos: Producto[];
  categorias: Array<{
    id: string;
    nombre: string;
    slug?: string | null;
  }>;
  permitirVentaSinStock?: boolean;
  nombreComercio?: string;
  mostrarSinStock?: boolean;
}

interface VarianteDisponible {
  variante: string;
  cantidad: number;
  precio: number | null;
  /** producto_variantes.id real; undefined en el fallback legacy (productos_stock). */
  varianteId: string | undefined;
}

const getStockTotal = (producto: Producto) => {
  const stockNuevos =
    producto.producto_variantes?.reduce(
      (acc, v) => acc + Number(v.stock_disponible ?? v.stock ?? 0),
      0,
    ) || 0;

  // Solo se suma el stock legacy si el producto no tiene producto_variantes
  // — si no, se duplica el total porque ambas fuentes describen el mismo stock.
  if (producto.producto_variantes && producto.producto_variantes.length > 0) {
    return stockNuevos;
  }

  const stockViejos =
    producto.stock?.reduce((acc, s) => acc + Number(s.cantidad || 0), 0) || 0;

  return stockViejos + stockNuevos;
};

export function PosTerminal({
  productos,
  categorias,
  permitirVentaSinStock = false,
  nombreComercio = "Tienda",
  mostrarSinStock = true,
}: Readonly<PosTerminalProps>) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const [searchQuery, setSearchQuery] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [filtrosVariantes, setFiltrosVariantes] = useState<
    Record<string, string[]>
  >({});

  // Estados para el Modal Rápido
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const addItem = useCartStore((state) => state.addItem);
  const setIsOpenCart = useCartStore((state) => state.setIsOpen);

  const { categoriasConStock, productosFiltrados, propiedadesGlobales } =
    useCatalogFilters({
      productos,
      categorias,
      searchQuery,
      tipo,
      filtrosVariantes,
      orden: "mas_vendidos",
      visibleCount: 1000,
    });

  const categoriasDisponibles = useMemo(
    () =>
      categoriasConStock.map((categoria) => ({
        nombre: categoria.nombre,
        value: categoria.id,
        count: categoria.count,
      })),
    [categoriasConStock],
  );

  const productosOrdenados = useMemo(
    () =>
      [...productosFiltrados].sort((a, b) => {
        const stockA = getStockTotal(a);
        const stockB = getStockTotal(b);

        if (stockA > 0 && stockB <= 0) return -1;
        if (stockA <= 0 && stockB > 0) return 1;
        return 0;
      }),
    [productosFiltrados],
  );

  const hayFiltrosActivos =
    searchQuery !== "" ||
    tipo !== "todos" ||
    Object.values(filtrosVariantes).some((valores) => valores.length > 0);

  const limpiarFiltros = () => {
    setSearchQuery("");
    setTipo("todos");
    setFiltrosVariantes({});
  };

  const handleFiltroVarianteChange = (propiedad: string, valor: string) => {
    setFiltrosVariantes((prev) => {
      if (valor === "todos") return { ...prev, [propiedad]: [] };
      const actuales = prev[propiedad] ?? [];
      const siguientes = actuales.includes(valor)
        ? actuales.filter((v) => v !== valor)
        : [...actuales, valor];
      return { ...prev, [propiedad]: siguientes };
    });
  };

  const handleProductClick = (producto: Producto) => {
    // 1. Calculamos stock real unificado. Solo se recurre al stock legacy
    // si el producto no tiene producto_variantes — si no, se duplica el
    // conteo porque ambas fuentes describen el mismo stock.
    const variantesArray: VarianteDisponible[] = [];
    producto.producto_variantes?.forEach((v) =>
      variantesArray.push({
        variante: v.nombre_display,
        cantidad: v.stock_disponible ?? v.stock,
        precio: v.precio,
        varianteId: v.id,
      }),
    );
    const tieneVariantesMigradas =
      (producto.producto_variantes?.length ?? 0) > 0;
    if (!tieneVariantesMigradas) {
      // productos_stock, no producto_variantes: varianteId indefinido a
      // propósito, nunca el id de la fila de stock legacy.
      producto.stock?.forEach((s) =>
        variantesArray.push({
          variante: s.variante,
          cantidad: s.cantidad,
          precio: null,
          varianteId: undefined,
        }),
      );
    }

    const variantesParaVender = permitirVentaSinStock
      ? variantesArray
      : variantesArray.filter((v) => v.cantidad > 0);

    if (variantesParaVender.length === 0) {
      toast.error("Producto agotado.");
      return;
    }

    // 2. Si es variante única, se agrega como un rayo
    if (variantesParaVender.length === 1) {
      let imagenes: string[] = [];
      if (typeof producto.imagen_url === "string") {
        try {
          imagenes = JSON.parse(producto.imagen_url);
        } catch {
          imagenes = [producto.imagen_url];
        }
      } else if (Array.isArray(producto.imagen_url)) {
        imagenes = producto.imagen_url;
      }

      let miniaturas: string[] = [];
      if (typeof producto.thumbnail_url === "string") {
        try {
          miniaturas = JSON.parse(producto.thumbnail_url);
        } catch {
          miniaturas = [producto.thumbnail_url];
        }
      } else if (Array.isArray(producto.thumbnail_url)) {
        miniaturas = producto.thumbnail_url;
      }

      let grids: string[] = [];
      if (typeof producto.grid_url === "string") {
        try {
          grids = JSON.parse(producto.grid_url);
        } catch {
          grids = [producto.grid_url];
        }
      } else if (Array.isArray(producto.grid_url)) {
        grids = producto.grid_url;
      }

      addItem({
        productoId: producto.id,
        nombre: producto.nombre || "Sin nombre",
        tipo: producto.tipo || "",
        variante: variantesParaVender[0].variante,
        varianteId: variantesParaVender[0].varianteId,
        precio: variantesParaVender[0].precio ?? producto.precio,
        cantidad: 1,
        imagenUrl: grids[0] || miniaturas[0] || imagenes[0] || null,
        stockMaximo: variantesParaVender[0].cantidad,
      });

      // toast.success("Agregado a la cuenta");
      setIsOpenCart(true);
    } else {
      // 3. Si tiene múltiples variantes, abrimos el QuickAddModal
      setSelectedProduct(producto);
      setIsModalOpen(true);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      {/* LADO IZQUIERDO: CATÁLOGO POS */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Toolbar POS */}
        <StockFiltersToolbar
          view="grid"
          onViewChange={() => undefined}
          showViewToggle={false}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoriaActiva={tipo}
          onCategoriaChange={setTipo}
          categoriasDisponibles={categoriasDisponibles}
          conteosPorCategoria={{}}
          totalProductos={productos.length}
          hayFiltrosActivos={hayFiltrosActivos}
          propiedadesGlobales={propiedadesGlobales}
          filtrosVariantes={filtrosVariantes}
          onFiltroVarianteChange={handleFiltroVarianteChange}
          isAdmin={false}
          onLimpiarFiltros={limpiarFiltros}
        />

        {/* Grilla de Productos */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-4 sm:p-6 min-h-0">
          {productosOrdenados.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium text-lg">No se encontraron productos</p>
              <p className="text-sm mt-1">
                Intenta con otra búsqueda o categoría.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-20 lg:pb-0">
              {productosOrdenados.map((producto, index) => {
                let imagenes: string[] = [];
                if (typeof producto.imagen_url === "string") {
                  try {
                    imagenes = JSON.parse(producto.imagen_url);
                  } catch {
                    imagenes = [producto.imagen_url];
                  }
                } else if (Array.isArray(producto.imagen_url)) {
                  imagenes = producto.imagen_url;
                }

                let miniaturas: string[] = [];
                if (typeof producto.thumbnail_url === "string") {
                  try {
                    miniaturas = JSON.parse(producto.thumbnail_url);
                  } catch {
                    miniaturas = [producto.thumbnail_url];
                  }
                } else if (Array.isArray(producto.thumbnail_url)) {
                  miniaturas = producto.thumbnail_url;
                }

                let grids: string[] = [];
                if (typeof producto.grid_url === "string") {
                  try {
                    grids = JSON.parse(producto.grid_url);
                  } catch {
                    grids = [producto.grid_url];
                  }
                } else if (Array.isArray(producto.grid_url)) {
                  grids = producto.grid_url;
                }
                const primeraImagen =
                  grids[0] || miniaturas[0] || imagenes[0] || null;

                const stockTotal = getStockTotal(producto);
                const sinStock = stockTotal <= 0;
                const bloqueado = sinStock && !permitirVentaSinStock;

                const urlProducto = producto.slug
                  ? construirUrlProducto(baseUrl, producto.slug)
                  : null;
                const compartirDeshabilitado =
                  !urlProducto ||
                  !esVisibleEnCatalogo(
                    { publicado: producto.publicado, stockTotal },
                    { mostrarSinStock },
                  );
                const motivoCompartirDeshabilitado = !urlProducto
                  ? "Este producto no tiene link público"
                  : "Este producto no está visible en el catálogo";

                return (
                  // El ícono de compartir vive como hermano del <button> de
                  // agregar-al-carrito (no anidado — un <button> dentro de
                  // otro <button> es HTML inválido) para no competir con el
                  // tap principal de la card.
                  <div key={producto.id} className="relative h-full">
                    <button
                      onClick={() => handleProductClick(producto)}
                      disabled={bloqueado}
                      className={`flex flex-col text-left rounded-xl border transition-all overflow-hidden cursor-pointer w-full h-full ${
                        !bloqueado
                          ? "border-border hover:border-foreground/50 active:scale-95"
                          : "border-border/40 opacity-50"
                      }`}
                    >
                      <div className="w-full aspect-4/3 bg-muted relative border-b border-border/40">
                        {primeraImagen ? (
                          <Image
                            src={primeraImagen}
                            alt={producto.nombre || ""}
                            fill
                            className="object-cover"
                            sizes="200px"
                            priority={index < 8}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="w-8 h-8 text-muted-foreground/30" />
                          </div>
                        )}
                        {sinStock && (
                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="bg-white px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest text-rose-600 border border-rose-100">
                              Agotado
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col flex-1 justify-between">
                        <p className="font-medium text-xs sm:text-sm text-muted-foreground leading-tight line-clamp-2 mb-2">
                          {producto.nombre}
                        </p>
                        <p className="font-bold text-sm sm:text-base text-foreground">
                          {formatearMoneda(producto.precio)}
                        </p>
                      </div>
                    </button>

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
                );
              })}
            </div>
          )}
        </div>
      </div>

      <QuickAddModal
        producto={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        permitirVentaSinStock={permitirVentaSinStock}
      />
    </div>
  );
}
