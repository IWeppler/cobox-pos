"use client";

import { Fragment, useState } from "react";
import { useSlugNegocioActivo } from "@/shared/components/negocio-activo-provider";
import Image from "next/image";
import { ProductoIndice } from "@/entities/productos/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Button } from "@/shared/ui/button";
import {
  Edit2,
  ImageIcon,
  MinusCircle,
  MoreVertical,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeProducto,
  construirUrlProducto,
  esVisibleEnCatalogo,
} from "@/shared/utils/compartir-catalogo";
import { ProductEditDetailSheet } from "./edit-sheet";
import { EliminarProductoModal } from "./delete-modal";
import { BajaModal } from "@/features/baja/ui/baja-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { formatearMoneda } from "@/shared/utils/formatters";
import { useStockCartActions } from "../hooks/use-stock-cart-actions";
import {
  getTotalStock,
  getVariantesVisibles,
  obtenerPrimeraImagen as getPrimeraImagen,
} from "../lib/stock-product-utils";
import {
  resolverCategoriaDisplayPartes,
  type CategoriaBase,
} from "@/shared/utils/category-tree";
import { badgesIdentidad } from "../lib/identidad-por-rubro";
import type { Rubro } from "@/entities/config/types";
import type { SeleccionProductos } from "../hooks/use-seleccion-productos";

interface StockTableProps {
  productos: ProductoIndice[];
  userRole: string;
  nombreComercio: string;
  mostrarSinStock: boolean;
  /** Ya viene ordenado por el padre (stock-view.tsx) — el sort corre sobre
   * todo el catálogo filtrado antes de paginar, no solo sobre esta página. */
  orden: string;
  onSort: (columna: string) => void;
  /** Categorías reales (con parent_id) para armar el label combinado
   * "Padre › Hijo" de cada producto — mismo fetch que ya usa stock-view.tsx
   * para los chips, no uno nuevo. Distinto de `categorias`
   * (useActiveCategories, más abajo) que solo trae raíces para el dropdown
   * de "mover a categoría". */
  categoriasArbol: CategoriaBase[];
  /** indumentaria -> badge "N var."; electro -> Modelo + EAN. */
  rubro: Rubro;
  /** La selección vive en stock-view (sobrevive a paginar y a cambiar de
   * vista). Acá solo se pinta y se togglea — las acciones masivas viven en
   * la barra de selección, no en la tabla. */
  seleccion: SeleccionProductos;
}

const obtenerPrimeraImagen = (imagenUrl: unknown): string | null => {
  return getPrimeraImagen(imagenUrl);
};

/** En modo selección el tap sobre la fila selecciona/deselecciona, así que el
 * detalle NO debe abrirse: en vez de interceptar el click, directamente no se
 * monta el trigger del sheet (el click burbujea a la fila y listo). */
function AbrirDetalle({
  activo,
  producto,
  nombreComercio,
  mostrarSinStock,
  children,
}: Readonly<{
  activo: boolean;
  producto: ProductoIndice;
  nombreComercio: string;
  mostrarSinStock: boolean;
  children: React.ReactNode;
}>) {
  if (!activo) return <>{children}</>;
  return (
    <ProductEditDetailSheet
      producto={producto}
      nombreComercio={nombreComercio}
      mostrarSinStock={mostrarSinStock}
    >
      {children}
    </ProductEditDetailSheet>
  );
}

type StockTableVariant = {
  id?: string;
  variante?: string;
  nombre_display?: string;
  stock?: number | string | null;
  cantidad?: number | string | null;
  precio?: number | string | null;
  costo?: number | string | null;
};

/** Costo/precio "efectivo" de una variante: el propio si está seteado, o el del producto si la variante lo hereda (precio/costo null). */
function precioEfectivoVariante(
  variante: StockTableVariant,
  campo: "precio" | "costo",
  fallback: number,
) {
  const valor = variante[campo];
  return valor === null || valor === undefined || valor === ""
    ? fallback
    : Number(valor);
}

function calcularRango(valores: number[]) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return { min, max, esUniforme: min === max };
}

export function StockTable({
  productos,
  userRole,
  nombreComercio,
  mostrarSinStock,
  orden,
  onSort,
  categoriasArbol,
  rubro,
  seleccion,
}: Readonly<StockTableProps>) {
  const { isAdmin } = useStockCartActions(userRole);
  // El link del catálogo necesita el negocio, no solo el origen: cada
  // comercio tiene su propia tienda.
  const slugNegocio = useSlugNegocioActivo() ?? "";
  const [variantesAbiertas, setVariantesAbiertas] = useState<
    Record<string, boolean>
  >({});
  const [productoEnEdicion, setProductoEnEdicion] =
    useState<ProductoIndice | null>(null);

  const toggleVariantes = (id: string) => {
    setVariantesAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // --- LÓGICA DE ORDENAMIENTO --- (el sort en sí corre en stock-view.tsx,
  // sobre todo el catálogo filtrado; acá solo se decide qué columna/sentido
  // pedir y cómo se ve el ícono)
  const handleSort = (columna: string) => {
    if (orden === `${columna}_asc`) {
      onSort(`${columna}_desc`);
    } else {
      onSort(`${columna}_asc`);
    }
  };

  const renderSortIcon = (columna: string) => {
    if (orden === `${columna}_asc`)
      return <ArrowUp className="w-3.5 h-3.5 shrink-0" />;
    if (orden === `${columna}_desc`)
      return <ArrowDown className="w-3.5 h-3.5 shrink-0" />;
    return (
      <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
    );
  };

  if (productos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No hay productos disponibles en este momento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 ">
      {productoEnEdicion && (
        <ProductEditDetailSheet
          producto={productoEnEdicion}
          nombreComercio={nombreComercio}
          mostrarSinStock={mostrarSinStock}
          open
          onOpenChange={(open) => {
            if (!open) setProductoEnEdicion(null);
          }}
          hideTrigger
        />
      )}

      {/* --- CONTENEDOR DE LA TABLA --- */}
      <div className="overflow-hidden">
        <Table className="w-full sm:min-w-200 bg-card">
          <TableHeader>
            <TableRow className="bg-muted/30 border-b border-border/60 hover:bg-muted/30">
              {/* Columna Checkbox (oculta en mobile: ahí se selecciona con
                  long press sobre la fila) */}
              <TableHead className="w-12 pl-2 md:pl-4 pr-0 hidden sm:table-cell">
                <input
                  type="checkbox"
                  checked={seleccion.paginaCompleta}
                  onChange={seleccion.seleccionarPagina}
                  aria-label="Seleccionar todos los de esta página"
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                />
              </TableHead>

              {/* 1. Unificamos Foto y Producto en una sola columna. Ancho fijo
                  en desktop: es la única columna elástica, así que sin esto se
                  come todo el sobrante y Categoría queda apretada. */}
              <TableHead className="text-muted-foreground pl-2 text-xs sm:text-sm sm:w-50 md:w-60">
                <button
                  onClick={() => handleSort("nombre")}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Producto {renderSortIcon("nombre")}
                </button>
              </TableHead>
              <TableHead className="text-right hidden sm:table-cell text-muted-foreground w-24">
                <button
                  onClick={() => handleSort("categoria")}
                  className="flex items-center justify-start w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Categoría {renderSortIcon("categoria")}
                </button>
              </TableHead>
              {/* Stock Total (Oculto en móviles) */}
              <TableHead className="text-center hidden sm:table-cell text-muted-foreground w-16">
                <button
                  onClick={() => handleSort("stock")}
                  className="flex items-center justify-center w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Stock {renderSortIcon("stock")}
                </button>
              </TableHead>

              {/* Sin columna "Recargo": era 100% derivable de Costo y Precio.
                  El % vive ahora como badge al lado del Precio. */}
              {isAdmin && (
                <TableHead className="text-right hidden md:table-cell text-muted-foreground w-16">
                  <button
                    onClick={() => handleSort("costo")}
                    className="flex items-center justify-end w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                  >
                    Costo {renderSortIcon("costo")}
                  </button>
                </TableHead>
              )}

              <TableHead className="text-right text-muted-foreground w-20 sm:w-20 text-xs sm:text-sm">
                <button
                  onClick={() => handleSort("precio")}
                  className="flex items-center justify-end w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Precio {renderSortIcon("precio")}
                </button>
              </TableHead>
              <TableHead className="text-right w-16 sm:w-24 pr-2 sm:pr-6 text-muted-foreground text-xs sm:text-sm hidden sm:table-cell">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {productos.map((producto, index) => {
              const primeraImagen =
                obtenerPrimeraImagen(producto.thumbnail_url) ??
                obtenerPrimeraImagen(producto.imagen_url);
              const totalUnidades = getTotalStock(producto);
              const categoriaPartes = resolverCategoriaDisplayPartes(
                categoriasArbol,
                producto.categoria_id,
              );
              const categoriaTitulo = categoriaPartes
                ? [categoriaPartes.padre, categoriaPartes.nombre]
                    .filter(Boolean)
                    .join(" › ")
                : undefined;
              const variantesVisibles = getVariantesVisibles(producto, isAdmin);

              const isSelected = seleccion.estaSeleccionado(producto.id);
              const hasVariantes = variantesVisibles.length > 1;
              const variantesEstanAbiertas = variantesAbiertas[producto.id];

              const urlProducto = producto.slug
                ? construirUrlProducto(slugNegocio, producto.slug)
                : null;
              const compartirDeshabilitado =
                !urlProducto ||
                !esVisibleEnCatalogo(
                  { publicado: producto.publicado, stockTotal: totalUnidades },
                  { mostrarSinStock },
                );
              const motivoCompartirDeshabilitado = !urlProducto
                ? "Este producto no tiene link público"
                : "Este producto no está visible en el catálogo";

              // Cálculos de Recargo (sobre costo, no sobre precio de venta)
              const costo = producto.precio_costo || 0;
              const precio = producto.precio || 0;
              const gananciaNeta = precio - costo;
              const recargoPorcentaje =
                costo > 0 ? Math.round((gananciaNeta / costo) * 100) : 100;

              // Rango de costo/precio cuando las variantes no son uniformes:
              // cada variante hereda el precio/costo del producto salvo que
              // tenga su propio override en producto_variantes.
              const rangoCosto = hasVariantes
                ? calcularRango(
                    variantesVisibles.map((v: StockTableVariant) =>
                      precioEfectivoVariante(v, "costo", costo),
                    ),
                  )
                : null;
              const rangoPrecio = hasVariantes
                ? calcularRango(
                    variantesVisibles.map((v: StockTableVariant) =>
                      precioEfectivoVariante(v, "precio", precio),
                    ),
                  )
                : null;
              const preciosVarian = rangoCosto
                ? !rangoCosto.esUniforme || !rangoPrecio!.esUniforme
                : false;

              // 3. Status Dot (Puntito) para el stock
              let dotColor = "bg-success"; // Normal
              if (totalUnidades === 0)
                dotColor = "bg-danger"; // Agotado
              else if (totalUnidades < 5) dotColor = "bg-warning"; // Stock Bajo

              return (
                <Fragment key={producto.id}>
                  <TableRow
                    {...seleccion.propsSeleccionables(producto.id)}
                    className={`group transition-colors border-b border-border/40 select-none sm:select-auto [-webkit-touch-callout:none] ${
                      isSelected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : variantesEstanAbiertas
                          ? "bg-muted"
                          : "hover:bg-muted/20"
                    }`}
                  >
                    {/* Checkbox (oculto en mobile: long press + tap) */}
                    <TableCell className="pl-2 md:pl-4 pr-0 hidden sm:table-cell">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        aria-label={`Seleccionar ${producto.nombre}`}
                        // onClick y no onChange: el evento de change no trae
                        // shiftKey, y shift-click es lo que permite marcar un
                        // rango entero sin 40 clicks.
                        onClick={(e) => {
                          e.stopPropagation();
                          seleccion.toggle(producto.id, {
                            extenderRango: e.shiftKey,
                          });
                        }}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    </TableCell>

                    {/* 1. Celda Unificada: Flecha + Imagen + Producto (Más compacta en móviles) */}
                    <TableCell className="py-1.5 px-0 pl-1 sm:pl-2">
                      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                        <button
                          onClick={(e) => {
                            // Expandir variantes no debe contar como tap de
                            // selección sobre la fila.
                            e.stopPropagation();
                            if (hasVariantes) toggleVariantes(producto.id);
                          }}
                          className={`p-0.5 sm:p-1 rounded hover:bg-muted/80 transition-colors shrink-0 ${
                            !hasVariantes && "opacity-0 cursor-default"
                          }`}
                          disabled={!hasVariantes}
                        >
                          {variantesEstanAbiertas ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>

                        <AbrirDetalle
                          activo={!seleccion.modoSeleccion}
                          producto={producto}
                          nombreComercio={nombreComercio}
                          mostrarSinStock={mostrarSinStock}
                        >
                          <button className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-md md:rounded-lg bg-muted/60 flex items-center justify-center overflow-hidden border border-border/80 cursor-pointer hover:opacity-85 transition-opacity shrink-0 shadow-none">
                            {primeraImagen ? (
                              <Image
                                src={primeraImagen}
                                alt={producto.nombre}
                                width={40}
                                height={40}
                                className="object-cover w-full h-full"
                                priority={index < 8}
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-muted-foreground/60" />
                            )}
                            {/* Marca de selección sobre la miniatura: en mobile
                                es el único indicador además del fondo, porque
                                ya no hay columna de checkbox. */}
                            {seleccion.modoSeleccion && isSelected && (
                              <span className="absolute inset-0 flex items-center justify-center bg-primary/85 text-primary-foreground">
                                <Check className="w-4 h-4" strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        </AbrirDetalle>

                        <div className="flex flex-col min-w-0 flex-1">
                          <AbrirDetalle
                            activo={!seleccion.modoSeleccion}
                            producto={producto}
                            nombreComercio={nombreComercio}
                            mostrarSinStock={mostrarSinStock}
                          >
                            <button className="font-semibold text-foreground text-xs sm:text-sm text-left truncate block w-full max-w-50 md:max-w-60 cursor-pointer">
                              {producto.nombre}
                            </button>
                          </AbrirDetalle>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            {producto.marca && (
                              <span className="text-[9px] sm:text-[10px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50 truncate max-w-24">
                                {producto.marca}
                              </span>
                            )}
                            {badgesIdentidad(
                              producto,
                              variantesVisibles,
                              rubro,
                            ).map((badge) => (
                              <span
                                key={badge.clave}
                                title={badge.titulo}
                                className="text-[9px] sm:text-[10px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50 truncate max-w-32"
                              >
                                {badge.texto}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* CATEGORÍA — padre e hijo apilados, no "Padre › Hijo" en
                        una línea: la versión horizontal se truncaba justo en la
                        parte específica ("COMPLEMENTOS › ..."). El ancho sale
                        de la columna Producto, no de Stock. */}
                    <TableCell className="py-1 hidden sm:table-cell text-muted-foreground text-sm max-w-56">
                      {categoriaPartes && (
                        <div
                          className="flex flex-col min-w-0"
                          title={categoriaTitulo}
                        >
                          {categoriaPartes.padre && (
                            <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/70 leading-tight">
                              {categoriaPartes.padre}
                            </span>
                          )}
                          <span className="truncate text-foreground text-xs sm:text-sm leading-tight">
                            {categoriaPartes.nombre}
                          </span>
                        </div>
                      )}
                    </TableCell>

                    {/* STOCK (Oculto en móviles) */}
                    <TableCell className="text-center py-1 hidden sm:table-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                        <span className="font-mono font-medium text-foreground">
                          {totalUnidades}{" "}
                          <span className="text-[10px] font-medium opacity-70 uppercase tracking-widest">
                            u.
                          </span>
                        </span>
                      </div>
                    </TableCell>

                    {/* COSTO */}
                    {isAdmin && (
                      <TableCell className="text-right font-mono text-muted-foreground hidden md:table-cell py-2.5">
                        {rangoCosto && !rangoCosto.esUniforme ? (
                          <span title="Las variantes tienen costos distintos">
                            {formatearMoneda(rangoCosto.min)} -{" "}
                            {formatearMoneda(rangoCosto.max)}
                          </span>
                        ) : (
                          formatearMoneda(costo)
                        )}
                      </TableCell>
                    )}

                    {/* PRECIO + badge de recargo derivado de costo/precio.
                        El badge es solo para admin: el % de margen deja leer
                        el costo por diferencia, y Costo ya es columna admin. */}
                    <TableCell className="text-right font-mono font-medium text-xs sm:text-sm px-1 sm:px-0 py-1 whitespace-nowrap tabular-nums">
                      <div className="flex flex-col items-end gap-0.5">
                        {rangoPrecio && !rangoPrecio.esUniforme ? (
                          <span title="Las variantes tienen precios distintos">
                            {formatearMoneda(rangoPrecio.min)} -{" "}
                            {formatearMoneda(rangoPrecio.max)}
                          </span>
                        ) : (
                          <span>{formatearMoneda(precio)}</span>
                        )}
                        {isAdmin && !preciosVarian && costo > 0 && (
                          <span
                            title={`Recargo sobre el costo: +${formatearMoneda(gananciaNeta)}`}
                            className="text-[9px] sm:text-[10px] font-sans font-medium leading-none px-1.5 py-0.5 rounded border bg-success/10 text-success border-success/20"
                          >
                            +{recargoPorcentaje}%
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* ACCIONES (oculta en mobile: cubierta por selección + barra flotante) */}
                    <TableCell className="text-right pl-0 pr-1 sm:pr-2 py-1 hidden sm:table-cell">
                      <div
                        className="flex items-center justify-end gap-0.5 md:gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ShareButton
                          url={urlProducto ?? ""}
                          title={`${producto.nombre} | ${nombreComercio}`}
                          text={armarMensajeProducto(
                            producto.nombre,
                            formatearMoneda(producto.precio),
                          )}
                          disabled={compartirDeshabilitado}
                          disabledReason={motivoCompartirDeshabilitado}
                          variant="ghost"
                          size="icon-sm"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-md hover:bg-muted"
                        />
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer shrink-0 rounded-md hover:bg-muted"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-52 p-1.5 rounded-xl border-border/60 shadow-md bg-card z-40"
                            >
                              <div className="flex flex-col gap-0.5">
                                <Button
                                  variant="ghost"
                                  className="w-full justify-start h-9 px-2 text-sm font-medium cursor-pointer rounded-lg hover:bg-muted transition-colors"
                                  onClick={() => setProductoEnEdicion(producto)}
                                >
                                  <Edit2 className="w-4 h-4 mr-2.5 text-success" />
                                  Editar producto
                                </Button>

                                <BajaModal producto={producto}>
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start h-9 px-2 text-sm font-medium cursor-pointer rounded-lg hover:bg-muted transition-colors"
                                  >
                                    <MinusCircle className="w-4 h-4 mr-2.5 text-warning" />
                                    Registrar baja
                                  </Button>
                                </BajaModal>

                                <DropdownMenuSeparator className="my-1 bg-border/60" />

                                <EliminarProductoModal
                                  id={producto.id}
                                  nombre={producto.nombre}
                                  tipo={producto.tipo}
                                >
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start h-9 px-2 text-sm font-medium cursor-pointer text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2.5 text-destructive" />
                                    Eliminar producto
                                  </Button>
                                </EliminarProductoModal>
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* SUB-FILA DE VARIANTES (Expansión) */}
                  {hasVariantes && variantesEstanAbiertas && (
                    <TableRow className="bg-muted/5 hover:bg-muted/5 border-b border-border/40">
                      {/* Usamos colSpan 100 para asegurar que ocupe todo sin importar cuántas columnas estén ocultas */}
                      <TableCell colSpan={100} className="p-0">
                        <div className="py-2 sm:py-3 pl-8 sm:pl-[4.5rem] pr-2 sm:pr-8 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="rounded-lg border border-border/50 bg-background/50 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40 text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40">
                                <tr>
                                  <th className="px-2 sm:px-4 py-2 sm:py-2.5 text-left font-semibold">
                                    Variante
                                  </th>
                                  <th className="px-2 sm:px-4 py-2 sm:py-2.5 text-center font-semibold w-20 sm:w-32">
                                    Stock
                                  </th>
                                  {isAdmin && (
                                    <th className="px-2 sm:px-4 py-2 sm:py-2.5 text-right font-semibold w-24 sm:w-28">
                                      Costo
                                    </th>
                                  )}
                                  <th className="px-2 sm:px-4 py-2 sm:py-2.5 text-right font-semibold w-24 sm:w-28">
                                    Precio
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {variantesVisibles.map(
                                  (v: StockTableVariant) => {
                                    const varStock = v.stock ?? v.cantidad ?? 0;
                                    const varCostoHeredado =
                                      v.costo === null || v.costo === undefined;
                                    const varPrecioHeredado =
                                      v.precio === null ||
                                      v.precio === undefined;
                                    const varCosto = precioEfectivoVariante(
                                      v,
                                      "costo",
                                      costo,
                                    );
                                    const varPrecio = precioEfectivoVariante(
                                      v,
                                      "precio",
                                      precio,
                                    );

                                    return (
                                      <tr
                                        key={v.id || v.variante}
                                        className="hover:bg-muted/30 transition-colors"
                                      >
                                        <td className="px-2 py-1 font-medium text-xs sm:text-sm text-foreground">
                                          {v.nombre_display || v.variante}
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                          <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                                            <div
                                              className={`w-1.5 h-1.5 rounded-full font-mono ${
                                                varStock === 0
                                                  ? "bg-danger"
                                                  : "bg-success"
                                              }`}
                                            />
                                            <span className="font-semibold text-xs sm:text-sm font-mono text-foreground">
                                              {varStock}{" "}
                                              <span className="text-[9px] sm:text-[10px] font-medium opacity-70 uppercase tracking-widest">
                                                u.
                                              </span>
                                            </span>
                                          </div>
                                        </td>
                                        {isAdmin && (
                                          <td
                                            className={`px-2 font-mono py-1 text-right text-xs sm:text-sm ${
                                              varCostoHeredado
                                                ? "text-muted-foreground italic"
                                                : "font-medium text-foreground"
                                            }`}
                                            title={
                                              varCostoHeredado
                                                ? "Hereda el costo del producto"
                                                : undefined
                                            }
                                          >
                                            {formatearMoneda(varCosto)}
                                          </td>
                                        )}
                                        <td
                                          className={`px-2 font-mono py-1 text-right text-xs sm:text-sm ${
                                            varPrecioHeredado
                                              ? "text-muted-foreground italic"
                                              : "font-semibold text-foreground"
                                          }`}
                                          title={
                                            varPrecioHeredado
                                              ? "Hereda el precio del producto"
                                              : undefined
                                          }
                                        >
                                          {formatearMoneda(varPrecio)}
                                        </td>
                                      </tr>
                                    );
                                  },
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
