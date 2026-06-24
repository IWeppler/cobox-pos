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
  Plus,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
  capitalizar as capitalizarTipo,
  getTotalStock,
  getVariantesVisibles,
  obtenerPrimeraImagen as getPrimeraImagen,
} from "../lib/stock-product-utils";

interface StockTableProps {
  productos: Producto[];
  userRole: string;
}

const capitalizar = (str: string) => {
  return capitalizarTipo(str);
};

const obtenerPrimeraImagen = (imagenUrl: unknown): string | null => {
  return getPrimeraImagen(imagenUrl);
};


export function StockTable({ productos, userRole }: Readonly<StockTableProps>) {
  const { isAdmin, agregarAlCarrito } = useStockCartActions(userRole);
  const [variantesAbiertas, setVariantesAbiertas] = useState<
    Record<string, boolean>
  >({});

  // Estado de Orden
  const [orden, setOrden] = useState<string>("nombre_asc");


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
      {/* --- CONTENEDOR DE LA TABLA --- */}
      <div className="overflow-hidden">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-muted/30 border-b border-border/60 hover:bg-muted/30">
              <TableHead className="w-16 pl-4 sm:pl-6 text-muted-foreground text-left">
                Foto
              </TableHead>
              <TableHead className="text-muted-foreground">
                <button
                  onClick={() => handleSort("nombre")}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Producto {renderSortIcon("nombre")}
                </button>
              </TableHead>
              <TableHead className="text-center hidden sm:table-cell text-muted-foreground w-32">
                <button
                  onClick={() => handleSort("stock")}
                  className="flex items-center justify-center w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Stock Total {renderSortIcon("stock")}
                </button>
              </TableHead>
              {isAdmin && (
                <TableHead className="text-right hidden md:table-cell text-muted-foreground w-28">
                  <button
                    onClick={() => handleSort("costo")}
                    className="flex items-center justify-end w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                  >
                    Costo {renderSortIcon("costo")}
                  </button>
                </TableHead>
              )}
              <TableHead className="text-right text-muted-foreground w-28">
                <button
                  onClick={() => handleSort("precio")}
                  className="flex items-center justify-end w-full gap-1.5 hover:text-foreground transition-colors group font-semibold"
                >
                  Precio {renderSortIcon("precio")}
                </button>
              </TableHead>
              <TableHead className="text-right w-24 sm:w-56 pr-4 sm:pr-6 text-muted-foreground">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {productosProcesados.map((producto) => {
              const primeraImagen = obtenerPrimeraImagen(producto.imagen_url);

              const totalUnidades = getTotalStock(producto);
              const variantesVisibles = getVariantesVisibles(producto, isAdmin);

              const sinStock = totalUnidades <= 0;
              const variantesEstanAbiertas = variantesAbiertas[producto.id];

              return (
                <Fragment key={producto.id}>
                  <TableRow
                    className={`group transition-colors border-b border-border/40 ${
                      variantesEstanAbiertas
                        ? "bg-muted/15"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    {/* IMAGEN */}
                    <TableCell className="pl-1 sm:pl-4 py-2.5">
                      <ProductEditDetailSheet producto={producto}>
                        <button className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-muted/60 flex items-center justify-center overflow-hidden border border-border/80 cursor-pointer hover:opacity-85 transition-opacity shrink-0 shadow-none">
                          {primeraImagen ? (
                            <Image
                              src={primeraImagen}
                              alt={producto.nombre}
                              width={44}
                              height={44}
                              className="object-cover w-full h-full"
                              priority={false}
                            />
                          ) : (
                            <ImageIcon className="w-4.5 h-4.5 text-muted-foreground/60" />
                          )}
                        </button>
                      </ProductEditDetailSheet>
                    </TableCell>

                    {/* NOMBRE */}
                    <TableCell className="py-2.5 px-0 mx-0">
                      <div className="flex flex-col">
                        <ProductEditDetailSheet producto={producto}>
                          <button className="font-semibold text-foreground text-sm sm:text-base hover:text-primary transition-colors text-left truncate max-w-30 sm:max-w-55 cursor-pointer">
                            {producto.nombre}
                          </button>
                        </ProductEditDetailSheet>
                        <div className="flex items-center gap-0.5 md:gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          <span className="capitalize">
                            {capitalizar(producto.tipo)}
                          </span>
                          <span>·</span>
                          <span>
                            {variantesVisibles.length}{" "}
                            {variantesVisibles.length === 1
                              ? "variante"
                              : "variantes"}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* STOCK */}
                    <TableCell className="text-center font-bold hidden sm:table-cell py-2.5">
                      <span
                        className={
                          sinStock ? "text-destructive" : "text-foreground"
                        }
                      >
                        {totalUnidades}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest">
                          u.
                        </span>
                      </span>
                    </TableCell>

                    {/* COSTO */}
                    {isAdmin && (
                      <TableCell className="text-right font-medium text-muted-foreground hidden md:table-cell py-2.5">
                        {formatearMoneda(producto.precio_costo ?? 0)}
                      </TableCell>
                    )}

                    <TableCell className="text-right font-bold text-sm sm:text-base px-0 py-2.5">
                      {formatearMoneda(producto.precio)}
                    </TableCell>

                    <TableCell className="text-right pl-0.5 sm:pr-6 py-2.5">
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
                                {/* <div className="flex items-center justify-between px-2.5 py-2 text-sm hover:bg-muted rounded-lg transition-colors">
                                  <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                    Catálogo web:
                                  </span>
                                  <TogglePublicado
                                    id={producto.id}
                                    publicadoInicial={
                                      producto.publicado ?? true
                                    }
                                  />
                                </div>
                                <DropdownMenuSeparator className="my-1 bg-border/60" /> */}

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
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
