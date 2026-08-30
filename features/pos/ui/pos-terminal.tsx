"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSlugNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { Producto } from "@/entities/productos/types";
import type { Rubro } from "@/entities/config/types";
import { PackagePlus, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/shared/store/cart-store";
import { queryKeys } from "@/shared/lib/query-keys";
import { toast } from "sonner";
import { useCatalogFilters } from "@/features/store/hooks/use-catalog-filters";
import { QuickAddModal } from "@/features/pos/ui/quick-add-modal";
import { PosProductList } from "@/features/pos/ui/pos-product-list";
import { posSinImagenes } from "@/features/pos/lib/vista-por-rubro";
import Image from "next/image";
import { StockFiltersToolbar } from "@/features/stock/ui/stock-filters-toolbar";
import { formatearMoneda } from "@/shared/utils/formatters";
import { sufijoPrecioPorUnidad } from "@/shared/lib/unidad-venta";
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeProducto,
  construirUrlProducto,
  esVisibleEnCatalogo,
} from "@/shared/utils/compartir-catalogo";
import {
  productoCargadoAProducto,
  resolverImagenPrincipal,
  resolverVariantesVendibles,
  type VarianteVendible,
} from "../lib/producto-a-carrito";
import { useCargaRapida } from "@/features/carga-rapida/hooks/use-carga-rapida";
import {
  CargaRapidaPanel,
  CargaRapidaRecargo,
} from "@/features/carga-rapida/ui/carga-rapida-panel";
import type { ProductoCargado } from "@/features/carga-rapida/types";
import { useCobroCcStore } from "@/shared/store/cobro-cc-store";
import { useAtajosTeclado } from "@/shared/hooks/use-atajos-teclado";

/** Con menos resultados que esto, la grilla ofrece cargar lo que se buscó:
 * no hay que esperar a que la búsqueda quede en cero para poder crearlo. */
const RESULTADOS_PARA_OFRECER_CARGA = 6;

interface PosTerminalProps {
  productos: Producto[];
  categorias: Array<{
    id: string;
    nombre: string;
    slug?: string | null;
    parent_id?: string | null;
  }>;
  permitirVentaSinStock?: boolean;
  nombreComercio?: string;
  mostrarSinStock?: boolean;
  /** Lo necesita la Carga rápida: en electro consulta el Catálogo Maestro,
   * en indumentaria ni lo intenta. */
  rubro: Rubro;
  /** Permiso `clientes.cobrar_cc`: decide si la barra ofrece "Cobrar deuda".
   * El modal vive montado en el layout; acá solo se lo abre. */
  puedeCobrarCuentaCorriente?: boolean;
  /** Búsqueda con la que arranca la pantalla. Hoy la manda la paleta (Ctrl+K)
   * por `?q=` cuando se elige un producto desde otra pantalla. */
  busquedaInicial?: string;
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
  rubro,
  puedeCobrarCuentaCorriente = false,
  busquedaInicial = "",
}: Readonly<PosTerminalProps>) {
  const abrirCobroCc = useCobroCcStore((state) => state.abrir);
  // El buscador de la barra: lo comparten la tecla "/" y la Carga rápida.
  const buscadorRef = useRef<HTMLInputElement>(null);
  // El link del catálogo necesita el negocio, no solo el origen: cada
  // comercio tiene su propia tienda.
  const slugNegocio = useSlugNegocioActivo() ?? "";
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState(busquedaInicial);
  const [tipo, setTipo] = useState("todos");
  const [filtrosVariantes, setFiltrosVariantes] = useState<
    Record<string, string[]>
  >({});

  // Estados para el Modal Rápido
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Carga rápida NO es otra pantalla: es una vista del mismo POS. Cambian la
  // grilla y la fila de pills; el buscador, el ticket y el sidebar quedan
  // donde están.
  const [vista, setVista] = useState<"vender" | "cargar">("vender");

  const addItem = useCartStore((state) => state.addItem);
  const setIsOpenCart = useCartStore((state) => state.setIsOpen);

  const {
    arbolCategorias,
    productosFiltrados,
    propiedadesGlobales,
    matchesFueraDeCategoria,
  } = useCatalogFilters({
    productos,
    categorias,
    searchQuery,
    tipo,
    filtrosVariantes,
    orden: "mas_vendidos",
    visibleCount: 1000,
  });

  // Padres primero (con sus hijos embebidos, para que el toolbar los
  // reconozca y ofrezca navegación de 2 niveles), después las categorías
  // sueltas — mismo orden que CategoryPills en el catálogo público.
  const categoriasDisponibles = useMemo(
    () => [
      ...arbolCategorias.padres.map((padre) => ({
        nombre: padre.nombre,
        value: padre.id,
        count: padre.count,
        hijos: padre.hijos.map((h) => ({
          nombre: h.nombre,
          value: h.id,
          count: h.count,
        })),
      })),
      ...arbolCategorias.sinPadre.map((cat) => ({
        nombre: cat.nombre,
        value: cat.id,
        count: cat.count,
      })),
    ],
    [arbolCategorias],
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

  // En kiosco y almacén la venta es por nombre, no de vista: la grilla pasa a
  // lista y el ticket del carrito deja de mostrar miniaturas. Se decide una
  // vez acá y viaja a los dos lugares, para que no puedan quedar en desacuerdo.
  const vistaSinImagenes = posSinImagenes(rubro);

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

  const agregarVarianteAlCarrito = (
    producto: Producto,
    variante: VarianteVendible,
  ) => {
    addItem({
      productoId: producto.id,
      nombre: producto.nombre || "Sin nombre",
      tipo: producto.tipo || "",
      variante: variante.variante,
      varianteId: variante.varianteId,
      precio: variante.precio ?? producto.precio,
      cantidad: 1,
      unidadMedida: producto.unidad_medida,
      imagenUrl: resolverImagenPrincipal(producto),
      stockMaximo: variante.cantidad,
    });
  };

  const handleProductClick = (producto: Producto) => {
    const variantesParaVender = resolverVariantesVendibles(
      producto,
      permitirVentaSinStock,
    );

    if (variantesParaVender.length === 0) {
      toast.error("Producto agotado.");
      return;
    }

    // Variante única: se agrega como un rayo.
    if (variantesParaVender.length === 1) {
      agregarVarianteAlCarrito(producto, variantesParaVender[0]);
      setIsOpenCart(true);
    } else {
      // Varias variantes: abrimos el selector.
      setSelectedProduct(producto);
      setIsModalOpen(true);
    }
  };

  /**
   * Contexto de retorno de la Carga rápida dentro del POS: volver a Vender,
   * refrescar el catálogo y seguir la venta con lo cargado.
   *
   * Lo cargado entra por el MISMO camino que un producto tocado en la grilla
   * (`handleProductClick`): variante única va derecho al carrito, y con
   * talles/colores se abre el selector de siempre.
   */
  const handleCargaRapidaFinalizada = (cargados: ProductoCargado[]) => {
    setVista("vender");
    setSearchQuery("");
    queryClient.invalidateQueries({ queryKey: queryKeys.pos.productos });
    queryClient.invalidateQueries({ queryKey: queryKeys.stock.index });

    if (cargados.length === 0) return;

    // El selector de variante es uno solo y modal, así que no se pueden
    // encadenar: se agregan directo los de variante única y el selector se
    // abre para el primero que lo necesite. El resto ya quedó en el catálogo
    // y se toca desde la grilla.
    let pendienteDeSelector: Producto | null = null;

    for (const cargado of cargados) {
      const producto = productoCargadoAProducto(cargado);
      const vendibles = resolverVariantesVendibles(
        producto,
        permitirVentaSinStock,
      );
      if (vendibles.length === 1) {
        agregarVarianteAlCarrito(producto, vendibles[0]);
      } else if (vendibles.length > 1 && !pendienteDeSelector) {
        pendienteDeSelector = producto;
      }
    }

    if (pendienteDeSelector) {
      setSelectedProduct(pendienteDeSelector);
      setIsModalOpen(true);
    } else {
      setIsOpenCart(true);
    }
  };

  // LA Carga rápida, la misma de Inventario: mismo hook, mismo panel. Lo
  // único propio del POS es el contexto de retorno y que el texto lo maneja
  // el buscador de arriba en vez de un input propio.
  const carga = useCargaRapida(productos, rubro, {
    query: searchQuery,
    onQueryChange: setSearchQuery,
    onFinalizar: handleCargaRapidaFinalizada,
  });

  /** La card "cargar" de la grilla: la persona ya vio que no está, así que
   * la línea entra directo y la vista cambia a Cargar para completar precio
   * y cantidad. Sin modal de por medio. */
  const cargarLoBuscado = () => {
    const texto = searchQuery.trim();
    if (!texto) {
      setVista("cargar");
      return;
    }
    carga.agregarLineaNueva(texto);
    setVista("cargar");
  };

  /**
   * Atajos de la mitad izquierda: catálogo y búsqueda. Los del ticket viven en
   * CartPanelAdmin, con sus propios handlers — repartidos por dueño y no en un
   * archivo de atajos aparte, que sería el archivo que se olvida de actualizar
   * cuando la acción cambia.
   *
   * Alt+1…9 entra por `handleProductClick`, el mismo camino que tocar la card:
   * variante única va derecho al ticket y con talles se abre el selector. Un
   * atajo que agregue "la primera variante" elegiría el talle por su cuenta.
   */
  useAtajosTeclado([
    {
      teclas: "F8",
      correr: () => setVista((v) => (v === "cargar" ? "vender" : "cargar")),
    },
    {
      teclas: "/",
      correr: () => buscadorRef.current?.focus(),
    },
    {
      teclas: "Escape",
      activo: hayFiltrosActivos,
      correr: limpiarFiltros,
    },
    ...Array.from({ length: 9 }, (_, indice) => ({
      teclas: `alt+${indice + 1}`,
      activo: vista === "vender",
      correr: () => {
        const producto = productosOrdenados[indice];
        if (producto) handleProductClick(producto);
      },
    })),
  ]);

  const ofrecerCarga =
    vista === "vender" &&
    searchQuery.trim().length > 0 &&
    productosOrdenados.length < RESULTADOS_PARA_OFRECER_CARGA;

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      {/* LADO IZQUIERDO: CATÁLOGO POS */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Toolbar POS */}
        <StockFiltersToolbar
          rubro={rubro}
          view="grid"
          onViewChange={() => undefined}
          showViewToggle={false}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoriaActiva={tipo}
          onCategoriaChange={setTipo}
          categoriasDisponibles={categoriasDisponibles}
          totalProductos={productos.length}
          resultadosFueraDeCategoria={matchesFueraDeCategoria}
          hayFiltrosActivos={hayFiltrosActivos}
          propiedadesGlobales={propiedadesGlobales}
          filtrosVariantes={filtrosVariantes}
          onFiltroVarianteChange={handleFiltroVarianteChange}
          isAdmin={false}
          onLimpiarFiltros={limpiarFiltros}
          onCargaRapida={() =>
            setVista((v) => (v === "cargar" ? "vender" : "cargar"))
          }
          cargaRapidaActiva={vista === "cargar"}
          onCobrarCuentaCorriente={
            puedeCobrarCuentaCorriente ? () => abrirCobroCc() : undefined
          }
          searchPlaceholder={
            vista === "cargar"
              ? "Escaneá o escribí y Enter…"
              : "Buscar producto..."
          }
          onSearchEnter={vista === "cargar" ? carga.procesarEnter : undefined}
          // En Cargar el ref es de la Carga rápida (necesita devolverle el
          // foco al input después de cada línea); en Vender es el nuestro, que
          // usa la tecla "/".
          searchInputRef={vista === "cargar" ? carga.inputRef : buscadorRef}
          searchDisabled={
            vista === "cargar" &&
            (carga.modalAbierto || carga.buscandoEnMaestro)
          }
          filaSecundaria={
            vista === "cargar" ? (
              <>
                <p className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                  {carga.buscandoEnMaestro
                    ? "Buscando en el Catálogo Maestro…"
                    : "Enter agrega a la lista. Al confirmar volvés a la venta con lo cargado."}
                </p>
                <CargaRapidaRecargo carga={carga} />
              </>
            ) : undefined
          }
        />

        {/* Área de productos: es lo único que cambia entre Vender y Cargar. */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-2 min-h-0">
          {vista === "cargar" ? (
            <div className="pb-20 lg:pb-0">
              <CargaRapidaPanel carga={carga} />
            </div>
          ) : productosOrdenados.length === 0 && !ofrecerCarga ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium text-lg">No se encontraron productos</p>
              <p className="text-sm mt-1">
                Intenta con otra búsqueda o categoría.
              </p>
            </div>
          ) : vistaSinImagenes ? (
            // Lista densa. Ver `posSinImagenes` para qué rubros la usan y por
            // qué es del rubro y no un toggle.
            <>
              <PosProductList
                productos={productosOrdenados}
                stockTotalDe={getStockTotal}
                permitirVentaSinStock={permitirVentaSinStock}
                mostrarSinStock={mostrarSinStock}
                slugNegocio={slugNegocio}
                nombreComercio={nombreComercio}
                onProductoClick={handleProductClick}
              />

              {ofrecerCarga && (
                <button
                  type="button"
                  onClick={cargarLoBuscado}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-3 transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
                >
                  <PackagePlus className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Cargar &quot;{searchQuery.trim()}&quot;
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    y seguí cobrando
                  </span>
                </button>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-20 lg:pb-0">
              {productosOrdenados.map((producto, index) => {
                const primeraImagen = resolverImagenPrincipal(producto);

                const stockTotal = getStockTotal(producto);
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
                const motivoCompartirDeshabilitado = !urlProducto
                  ? "Este producto no tiene link público"
                  : "Este producto no está visible en el catálogo";

                return (
                  // El ícono de compartir vive como hermano del <button> de
                  // agregar-al-carrito (no anidado — un <button> dentro de
                  // otro <button> es HTML inválido) para no competir con el
                  // tap principal de la card.
                  <div key={producto.id} className="relative h-full group">
                    <button
                      onClick={() => handleProductClick(producto)}
                      disabled={bloqueado}
                      className={`flex flex-col text-left rounded-lg bg-card transition-all overflow-hidden x w-full h-full cursor-pointer ${
                        !bloqueado
                          ? "shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                          : "shadow-xs opacity-50"
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
                          <div className="absolute inset-0 bg-background/55 backdrop-blur-[1px]">
                            <span className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-danger/10 text-danger border border-danger/20">
                              Agotado
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="px-3 pt-2 pb-3 flex flex-col flex-1 justify-between">
                        <p className="font-medium text-xs sm:text-sm text-foreground leading-tight line-clamp-2 mb-2">
                          {producto.nombre}
                        </p>
                        <p className="font-mono font-semibold tracking-tight text-sm sm:text-base text-muted-foreground">
                          {formatearMoneda(producto.precio)}
                          <span className="text-[10px] font-normal">
                            {sufijoPrecioPorUnidad(producto.unidad_medida)}
                          </span>
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
                      size="icon-xs"
                      className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm shadow-sm hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    />
                  </div>
                );
              })}

              {/* Card de carga: aparece con la búsqueda todavía dando
                  resultados, para no tener que llegar a cero antes de poder
                  cargar lo que no está. Punteada y sin foto — se lee como
                  acción, no como un producto más. */}
              {ofrecerCarga && (
                <button
                  type="button"
                  onClick={cargarLoBuscado}
                  className="flex flex-col items-center justify-center text-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors h-full min-h-44 p-3 cursor-pointer"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <PackagePlus className="w-5 h-5 text-primary" />
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-foreground line-clamp-2">
                    Cargar &quot;{searchQuery.trim()}&quot;
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    Lo creás y seguís cobrando
                  </span>
                </button>
              )}
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
