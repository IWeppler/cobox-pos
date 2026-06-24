"use client";

import { Fragment, useState, useMemo } from "react";
import Image from "next/image";
import { Producto } from "@/entities/productos/types";
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
} from "lucide-react";
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

interface StockTableProps {
  productos: Producto[];
  userRole: string;
}

// 2. Solución para las categorías: Separa camelCase/PascalCase (ej: FloresEstacion -> Flores Estacion)
const formatCategoria = (str: string) => {
  if (!str) return "";
  const conEspacios = str.replace(/([a-z])([A-Z])/g, "$1 $2");
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
};

const obtenerPrimeraImagen = (imagenUrl: unknown): string | null => {
  return getPrimeraImagen(imagenUrl);
};

export function StockTable({ productos, userRole }: Readonly<StockTableProps>) {
  const { isAdmin } = useStockCartActions(userRole);
  const [variantesAbiertas, setVariantesAbiertas] = useState<
    Record<string, boolean>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orden, setOrden] = useState<string>("nombre_asc");

  // --- LÓGICA DE SELECCIÓN MASIVA ---
  const toggleAll = () => {
    if (selectedIds.size === productos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(productos.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleVariantes = (id: string) => {
    setVariantesAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // --- LÓGICA DE ORDENAMIENTO ---
  const handleSort = (columna: string) => {
    if (orden === `${columna}_asc`) {
      setOrden(`${columna}_desc`);
    } else {
      setOrden(`${columna}_asc`);
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

  const productosProcesados = useMemo(() => {
    const filtrados = [...productos];

    filtrados.sort((a, b) => {
      switch (orden) {
        case "nombre_asc":
          return a.nombre.localeCompare(b.nombre);
        case "nombre_desc":
          return b.nombre.localeCompare(a.nombre);
        case "stock_desc":
          return getTotalStock(b) - getTotalStock(a);
        case "stock_asc":
          return getTotalStock(a) - getTotalStock(b);
        case "costo_desc":
          return (b.precio_costo || 0) - (a.precio_costo || 0);
        case "costo_asc":
          return (a.precio_costo || 0) - (b.precio_costo || 0);
        case "precio_desc":
          return b.precio - a.precio;
        case "precio_asc":
          return a.precio - b.precio;
        case "categoria_asc":
          return (a.tipo || "").localeCompare(b.tipo || "");
        case "categoria_desc":
          return (b.tipo || "").localeCompare(a.tipo || "");
        default:
          return 0;
      }
    });

    return filtrados;
  }, [productos, orden]);

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
    <div className="space-y-4">
      {/* ACCIONES MASIVAS: Barra flotante contextual */}
      {selectedIds.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
          <span className="text-sm font-bold text-primary px-2">
            {selectedIds.size}{" "}
            {selectedIds.size === 1
              ? "producto seleccionado"
              : "productos seleccionados"}
          </span>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs bg-white"
            >
              Cambiar Categoría
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs bg-white text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Eliminar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* --- CONTENEDOR DE LA TABLA --- */}
      <div className="overflow-hidden">
        <Table className="w-full sm:min-w-[800px]">
          <TableHeader>
            <TableRow className="bg-muted/30 border-b border-border/60 hover:bg-muted/30">
              {/* Columna Checkbox (Oculta en móviles) */}
              <TableHead className="w-12 pl-4 pr-0 hidden sm:table-cell">
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size === productos.length &&
                    productos.length > 0
                  }
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                />
              </TableHead>

              {/* 1. Unificamos Foto y Producto en una sola columna */}
              <TableHead className="text-muted-foreground pl-2 text-xs sm:text-sm">
                <button
                  onClick={() => handleSort("nombre")}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Producto {renderSortIcon("nombre")}
                </button>
              </TableHead>
              <TableHead className="text-left hidden sm:table-cell text-muted-foreground w-40">
                <button
                  onClick={() => handleSort("categoria")}
                  className="flex items-center justify-start w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Categoría {renderSortIcon("categoria")}
                </button>
              </TableHead>
              {/* Stock Total (Oculto en móviles) */}
              <TableHead className="text-center hidden sm:table-cell text-muted-foreground w-32">
                <button
                  onClick={() => handleSort("stock")}
                  className="flex items-center justify-center w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Stock {renderSortIcon("stock")}
                </button>
              </TableHead>

              {isAdmin && (
                <>
                  <TableHead className="text-right hidden md:table-cell text-muted-foreground w-28">
                    <button
                      onClick={() => handleSort("costo")}
                      className="flex items-center justify-end w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                    >
                      Costo {renderSortIcon("costo")}
                    </button>
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell text-muted-foreground w-28">
                    Margen
                  </TableHead>
                </>
              )}

              <TableHead className="text-right text-muted-foreground w-20 sm:w-28 text-xs sm:text-sm">
                <button
                  onClick={() => handleSort("precio")}
                  className="flex items-center justify-end w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Precio {renderSortIcon("precio")}
                </button>
              </TableHead>
              <TableHead className="text-right w-16 sm:w-24 pr-2 sm:pr-6 text-muted-foreground text-xs sm:text-sm">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {productosProcesados.map((producto) => {
              const primeraImagen = obtenerPrimeraImagen(producto.imagen_url);
              const totalUnidades = getTotalStock(producto);
              const variantesVisibles = getVariantesVisibles(producto, isAdmin);

              const isSelected = selectedIds.has(producto.id);
              const hasVariantes = variantesVisibles.length > 1;
              const variantesEstanAbiertas = variantesAbiertas[producto.id];

              // Cálculos de Margen
              const costo = producto.precio_costo || 0;
              const precio = producto.precio || 0;
              const gananciaNeta = precio - costo;
              const margenPorcentaje =
                costo > 0 ? Math.round((gananciaNeta / precio) * 100) : 100;

              // 3. Status Dot (Puntito) para el stock
              let dotColor = "bg-emerald-500"; // Normal
              if (totalUnidades === 0)
                dotColor = "bg-rose-500"; // Agotado
              else if (totalUnidades < 5) dotColor = "bg-amber-500"; // Stock Bajo

              return (
                <Fragment key={producto.id}>
                  <TableRow
                    className={`group transition-colors border-b border-border/40 ${
                      isSelected
                        ? "bg-primary/5 hover:bg-primary/10"
                        : variantesEstanAbiertas
                          ? "bg-muted/15"
                          : "hover:bg-muted/20"
                    }`}
                  >
                    {/* Checkbox (Oculto en móviles) */}
                    <TableCell className="pl-4 pr-0 hidden sm:table-cell">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(producto.id)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    </TableCell>

                    {/* 1. Celda Unificada: Flecha + Imagen + Producto (Más compacta en móviles) */}
                    <TableCell className="py-1.5 sm:py-2.5 px-0 pl-1 sm:pl-2">
                      <div className="flex items-center gap-1.5 sm:gap-3">
                        <button
                          onClick={() =>
                            hasVariantes && toggleVariantes(producto.id)
                          }
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

                        <ProductEditDetailSheet producto={producto}>
                          <button className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-muted/60 flex items-center justify-center overflow-hidden border border-border/80 cursor-pointer hover:opacity-85 transition-opacity shrink-0 shadow-none">
                            {primeraImagen ? (
                              <Image
                                src={primeraImagen}
                                alt={producto.nombre}
                                width={40}
                                height={40}
                                className="object-cover w-full h-full"
                                priority={false}
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-muted-foreground/60" />
                            )}
                          </button>
                        </ProductEditDetailSheet>

                        <div className="flex flex-col">
                          <ProductEditDetailSheet producto={producto}>
                            <button className="font-semibold text-foreground text-xs sm:text-sm hover:text-primary transition-colors text-left truncate max-w-[120px] sm:max-w-[200px] cursor-pointer">
                              {producto.nombre}
                            </button>
                          </ProductEditDetailSheet>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            {hasVariantes && (
                              <span className="text-[9px] sm:text-[10px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50">
                                {variantesVisibles.length} var.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* CATEGORÍA (Formateada) */}
                    <TableCell className="py-2.5 hidden sm:table-cell text-muted-foreground text-sm">
                      <span>{formatCategoria(producto.tipo)}</span>
                    </TableCell>

                    {/* STOCK (Oculto en móviles) */}
                    <TableCell className="text-center py-1.5 sm:py-2.5 hidden sm:table-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                        <span className="font-semibold text-foreground">
                          {totalUnidades}{" "}
                          <span className="text-[10px] font-medium opacity-70 uppercase tracking-widest">
                            u.
                          </span>
                        </span>
                      </div>
                    </TableCell>

                    {/* COSTO */}
                    {isAdmin && (
                      <TableCell className="text-right font-medium text-muted-foreground hidden md:table-cell py-2.5">
                        {formatearMoneda(costo)}
                      </TableCell>
                    )}

                    {/* MARGEN DE GANANCIA */}
                    {isAdmin && (
                      <TableCell className="text-right hidden lg:table-cell py-2.5">
                        {costo > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-emerald-600 font-bold text-sm">
                              +{formatearMoneda(gananciaNeta)}
                            </span>
                            <span className="text-xs text-muted-foreground font-medium">
                              {margenPorcentaje}% margen
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Sin costo
                          </span>
                        )}
                      </TableCell>
                    )}

                    {/* PRECIO (Adaptado) */}
                    <TableCell className="text-right font-bold text-xs sm:text-base px-0 py-1.5 sm:py-2.5">
                      {formatearMoneda(precio)}
                    </TableCell>

                    {/* ACCIONES (Paddings reducidos en móviles) */}
                    <TableCell className="text-right pl-0 pr-1 sm:pr-6 py-1.5 sm:py-2.5">
                      <div className="flex items-center justify-end gap-0.5 md:gap-1.5">
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
                                <ProductEditDetailSheet producto={producto}>
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start h-9 px-2 text-sm font-medium cursor-pointer rounded-lg hover:bg-muted transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4 mr-2.5 text-emerald-600" />
                                    Editar producto
                                  </Button>
                                </ProductEditDetailSheet>

                                <BajaModal producto={producto}>
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start h-9 px-2 text-sm font-medium cursor-pointer rounded-lg hover:bg-muted transition-colors"
                                  >
                                    <MinusCircle className="w-4 h-4 mr-2.5 text-amber-500" />
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
                          <div className="rounded-lg border border-border/50 bg-background/50 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40 text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40">
                                <tr>
                                  <th className="px-2 sm:px-4 py-2 sm:py-2.5 text-left font-semibold">
                                    Variante
                                  </th>
                                  <th className="px-2 sm:px-4 py-2 sm:py-2.5 text-center font-semibold w-20 sm:w-32">
                                    Stock
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {variantesVisibles.map((v: any) => {
                                  const varStock = v.stock ?? v.cantidad ?? 0;

                                  return (
                                    <tr
                                      key={v.id || v.variante}
                                      className="hover:bg-muted/30 transition-colors"
                                    >
                                      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-medium text-xs sm:text-sm text-foreground">
                                        {v.nombre_display || v.variante}
                                      </td>
                                      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-center">
                                        <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                                          <div
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              varStock === 0
                                                ? "bg-rose-500"
                                                : "bg-emerald-500"
                                            }`}
                                          />
                                          <span className="font-semibold text-xs sm:text-sm text-foreground">
                                            {varStock}{" "}
                                            <span className="text-[9px] sm:text-[10px] font-medium opacity-70 uppercase tracking-widest">
                                              u.
                                            </span>
                                          </span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
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
