"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  aprobarOrdenAction,
  crearProductoAlVueloAction,
} from "../actions/merge-purchase";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Save,
  ArrowLeft,
  Undo2,
  PlusCircle,
  Percent,
  Trash2,
  Search,
  ChevronDown,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { ItemResuelto, OrdenCompra } from "@/entities/compras/types";
import { Producto } from "@/entities/productos/types";
import { createClient } from "@/shared/config/supabase/client";
import { parseAttributeSegment } from "@/entities/productos/lib/parse-variant-attributes";

interface MergeTableProps {
  orden: OrdenCompra;
  itemsOriginales: ItemResuelto[];
  productos: Producto[];
}

type ItemResueltoConCategoria = ItemResuelto & {
  raw_categoria?: string | null;
};

// --- Combobox de Búsqueda Personalizado ---
function SearchableSelect({
  productos,
  value,
  onSelect,
}: {
  productos: Producto[];
  value: string | null;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cierra el dropdown si se hace click fuera de él
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtra los productos por el texto ingresado
  const filtered = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (p.tipo && p.tipo.toLowerCase().includes(search.toLowerCase())),
  );

  const selectedProduct = productos.find((p) => p.id === value);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Botón Trigger (Gatillo) */}
      <div
        className="flex items-center justify-between w-full h-10 px-3 py-2 text-sm bg-white border border-rose-300 rounded-md cursor-pointer focus:ring-2 focus:ring-rose-500 hover:bg-muted/10 transition-colors"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch(""); // Reseteamos la búsqueda al abrir
        }}
      >
        <span
          className={`truncate ${selectedProduct ? "text-foreground font-semibold" : "text-muted-foreground"}`}
        >
          {selectedProduct
            ? `${selectedProduct.nombre} (${selectedProduct.tipo})`
            : "-- Buscar Producto --"}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50 shrink-0 ml-2" />
      </div>

      {/* Contenido del Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-border rounded-md outline-none animate-in fade-in-0 zoom-in-95">
          {/* Buscador interno */}
          <div className="flex items-center px-3 border-b border-border/50">
            <Search className="w-4 h-4 mr-2 text-muted-foreground opacity-50" />
            <input
              type="text"
              className="flex w-full h-10 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground focus:ring-0"
              placeholder="Escribe para buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Lista de Resultados */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-4 text-sm text-center text-muted-foreground italic">
                No se encontraron productos.
              </p>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-muted font-medium"
                  onClick={() => {
                    onSelect(p.id);
                    setIsOpen(false);
                  }}
                >
                  {p.nombre}{" "}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({p.tipo})
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MergeTable({
  orden,
  itemsOriginales,
  productos,
}: Readonly<MergeTableProps>) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // En lugar de manejar índices sueltos, manejamos el `raw_nombre` de la agrupación
  const [groupToRemoveName, setGroupToRemoveName] = useState<string | null>(
    null,
  );
  const [groupToCreateName, setGroupToCreateName] = useState<string | null>(
    null,
  );

  // Estado local para productos (permite inyectar los creados al vuelo)
  const [localProductos, setLocalProductos] = useState<Producto[]>(productos);

  // Estado local plano de ítems para envío
  const [items, setItems] = useState<ItemResueltoConCategoria[]>(() =>
    itemsOriginales.map((item) => ({
      ...item,
      variante_match: item.variante_match || item.raw_variante || "Unico",
      precio_venta_actualizado:
        productoReal(item.producto_id, productos)?.precio || 0,
    })),
  );

  // Agrupación Computada Dinámicamente para Renderizar
  const groupedItems = useMemo(() => {
    const map = new Map<string, ItemResueltoConCategoria[]>();
    items.forEach((item) => {
      if (!map.has(item.raw_nombre)) map.set(item.raw_nombre, []);
      map.get(item.raw_nombre)!.push(item);
    });
    return Array.from(map.entries());
  }, [items]);

  // Grupo activo del modal "Crear Producto Múltiple" y si tiene costos
  // dispersos entre sus filas (para advertir que el precio unificado no
  // va a aplicar por igual a todas las variantes).
  const grupoParaCrear = useMemo(
    () =>
      groupToCreateName
        ? items.filter((i) => i.raw_nombre === groupToCreateName)
        : [],
    [items, groupToCreateName],
  );
  const grupoTieneCostoDisperso = useMemo(
    () => new Set(grupoParaCrear.map((i) => i.precio_costo)).size > 1,
    [grupoParaCrear],
  );

  // Estados para nuevas funcionalidades
  const [recargoGlobal, setRecargoGlobal] = useState<number | "">("");
  const [nuevoProductoData, setNuevoProductoData] = useState({
    nombre: "",
    precio: 0,
    categoria: "",
    origenPrecio: "",
  });
  const [categoriasDB, setCategoriasDB] = useState<
    { id: string; nombre: string }[]
  >([]);

  useEffect(() => {
    const fetchCats = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("categorias")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre");
      if (data) setCategoriasDB(data);
    };
    fetchCats();
  }, []);

  function productoReal(
    id: string | null,
    listaProductos = localProductos,
  ): Producto | undefined {
    if (!id) return undefined;
    return listaProductos.find((p) => p.id === id);
  }

  // --- Handlers Grupales ---

  const handleAssignProduct = (rawNombre: string, newProductId: string) => {
    const prod = productoReal(newProductId);

    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.raw_nombre === rawNombre) {
          return {
            ...item,
            producto_id: newProductId,
            // Si ya se calculó un precio (recargo global o edición manual), lo respetamos.
            // Solo caemos al precio actual del producto si todavía no hay nada calculado.
            precio_venta_actualizado:
              item.precio_venta_actualizado || prod?.precio || 0,
            estado_match:
              item.estado_match === "DESCONOCIDO"
                ? "NUEVO_ALIAS"
                : item.estado_match,
          };
        }
        return item;
      }),
    );
  };

  const handleUpdatePrice = (rawNombre: string, newPrice: number) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.raw_nombre === rawNombre
          ? { ...item, precio_venta_actualizado: newPrice }
          : item,
      ),
    );
  };

  const handleUndo = (rawNombre: string) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.raw_nombre === rawNombre) {
          return {
            ...item,
            producto_id: null,
            precio_venta_actualizado: 0,
            estado_match: "DESCONOCIDO",
          };
        }
        return item;
      }),
    );
    toast.info(`Asignación deshecha para "${rawNombre}".`);
  };

  const confirmRemoveGroup = () => {
    if (!groupToRemoveName) return;

    setItems((prevItems) =>
      prevItems.filter((item) => item.raw_nombre !== groupToRemoveName),
    );
    setGroupToRemoveName(null);
    toast.info("Agrupación descartada de la conciliación.");
  };

  const handleAplicarRecargoGlobal = () => {
    if (recargoGlobal === "" || recargoGlobal < 0) return;

    setItems((prevItems) =>
      prevItems.map((item) => ({
        ...item,
        precio_venta_actualizado: Math.ceil(
          item.precio_costo * (1 + Number(recargoGlobal) / 100),
        ),
      })),
    );
    toast.success(
      `Recargo del ${recargoGlobal}% aplicado a todos los productos.`,
    );
  };

  // --- Crear al Vuelo Grupal ---
  const handleCrearAlVuelo = async () => {
    if (!groupToCreateName) return;

    // Buscamos un item representativo del grupo para sacar el costo
    const itemActual = items.find((i) => i.raw_nombre === groupToCreateName);
    if (!itemActual) return;

    setIsSubmitting(true);
    const res = await crearProductoAlVueloAction(
      nuevoProductoData.nombre,
      itemActual.precio_costo,
      nuevoProductoData.precio,
      nuevoProductoData.categoria,
    );
    setIsSubmitting(false);

    if (res.error || !res.producto) {
      toast.error(res.error || "Ocurrió un error al crear.");
      return;
    }

    const nuevoProd = res.producto as Producto;
    setLocalProductos((prevProductos) => [...prevProductos, nuevoProd]);

    // Asignar el nuevo producto a todos los ítems de este grupo
    const precioUnificado = Number(
      nuevoProductoData.precio || nuevoProd.precio || 0,
    );
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.raw_nombre !== groupToCreateName) return item;

        return {
          ...item,
          producto_id: nuevoProd.id,
          precio_venta_actualizado: precioUnificado,
          estado_match:
            item.estado_match === "DESCONOCIDO"
              ? "NUEVO_ALIAS"
              : item.estado_match,
        };
      }),
    );

    toast.success(
      `Producto "${nuevoProd.nombre}" creado y asignado a ${items.filter((i) => i.raw_nombre === groupToCreateName).length} variantes.`,
    );
    setGroupToCreateName(null);
  };

  const handleAprobar = async () => {
    const sinResolver = items.some((i) => !i.producto_id);
    if (sinResolver) {
      toast.error(
        "Debes asignar un producto a todas las agrupaciones desconocidas (Rojas).",
      );
      return;
    }

    setIsSubmitting(true);
    toast.info("Impactando stock y precios...");

    const res = await aprobarOrdenAction(orden.id, orden.proveedor, items);

    if (res.success) {
      toast.success("¡Orden conciliada! Stock actualizado.");
      router.push("/stock");
    } else {
      toast.error(res.error || "Ocurrió un error.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 px-4 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/stock"
            className="text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-widest flex items-center mb-2"
          >
            <ArrowLeft className="w-3 h-3 mr-1" /> Volver al Inventario
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            Conciliación de Pedido
          </h1>
          <p className="text-muted-foreground mt-1">
            Proveedor: <strong>{orden.proveedor}</strong> | Total: $
            {Number(orden.total_presupuestado).toLocaleString("es-AR")}
          </p>
        </div>
        <Button
          size="lg"
          className="h-10 bg-primary hover:bg-primary/90 text-white w-full sm:w-auto cursor-pointer"
          onClick={handleAprobar}
          disabled={isSubmitting || items.length === 0}
        >
          <Save className="w-5 h-5 mr-2" />
          {isSubmitting ? "Procesando..." : "Confirmar e Impactar Stock"}
        </Button>
      </div>

      {/* Acciones Rápidas (Recargo Global) */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-background p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Percent className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium whitespace-nowrap">
            Aplicar recargo global a todos:
          </span>
          <Input
            type="number"
            placeholder="Ej: 30"
            className="w-20 h-8 text-center"
            value={recargoGlobal}
            onChange={(e) =>
              setRecargoGlobal(e.target.value ? Number(e.target.value) : "")
            }
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAplicarRecargoGlobal}
            className="hover:bg-foreground hover:text-white"
          >
            Aplicar
          </Button>
        </div>
      </div>

      {/* Leyenda Visual */}
      <div className="flex flex-wrap gap-4 px-2">
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1"
        >
          <CheckCircle2 className="w-4 h-4 mr-2" /> Match Perfecto
        </Badge>
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1"
        >
          <AlertTriangle className="w-4 h-4 mr-2" /> Aumento de Costo
        </Badge>
        <Badge
          variant="outline"
          className="bg-rose-50 text-rose-700 border-rose-200 px-3 py-1"
        >
          <HelpCircle className="w-4 h-4 mr-2" /> Desconocido / Para Revisar
        </Badge>
      </div>

      {/* Tabla Interactiva Agrupada */}
      <div className="bg-background rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[1000px]">
          <thead className="bg-muted/50 text-foreground/80 text-xs uppercase font-semibold tracking-wide border-b border-border">
            <tr>
              <th className="px-6 py-3 w-16 text-center">Estado</th>
              <th className="px-6 py-3 w-1/3">Productos del Remito</th>
              <th className="px-6 py-3 w-1/3">Vinculación en Sistema</th>
              <th className="px-6 py-3 text-right">Costo Und.</th>
              <th className="px-6 py-3 text-right">Precio Público</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groupedItems.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center py-12 text-muted-foreground"
                >
                  No hay ítems para conciliar.
                </td>
              </tr>
            ) : (
              groupedItems.map(([rawNombre, group]) => {
                // Tomamos el primer item como representativo para estado y costos base
                const firstItem = group[0];
                const pReal = productoReal(firstItem.producto_id);
                const isPerfecto =
                  firstItem.estado_match === "PERFECTO" ||
                  firstItem.estado_match === "NUEVO_ALIAS";
                const isInflacion = firstItem.estado_match === "MODIFICADO";
                const isDesconocido = firstItem.estado_match === "DESCONOCIDO";
                const totalGroupStock = group.reduce(
                  (sum, i) => sum + i.cantidad,
                  0,
                );

                let rowClassName = "hover:bg-muted/30";
                if (isInflacion)
                  rowClassName = "bg-amber-50/30 hover:bg-amber-50/50";
                else if (isDesconocido)
                  rowClassName = "bg-rose-50/40 hover:bg-rose-50/60";

                return (
                  <tr
                    key={rawNombre}
                    className={`transition-colors ${rowClassName}`}
                  >
                    {/* STATUS */}
                    <td className="px-6 py-4 text-center align-top pt-5">
                      {isPerfecto && (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      )}
                      {isInflacion && (
                        <AlertTriangle
                          className="w-6 h-6 text-amber-500 mx-auto"
                        />
                      )}
                      {isDesconocido && (
                        <HelpCircle
                          className="w-6 h-6 text-rose-500 animate-pulse mx-auto"
                        />
                      )}
                    </td>

                    {/* PRODUCTO DEL PROVEEDOR (Desglose de variantes) */}
                    <td className="px-6 py-4 align-top">
                      <p className="font-bold text-foreground uppercase tracking-wide">
                        {rawNombre}
                      </p>
                      {/* Sub-bloques de variantes integrados */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.map((item, idx) => {
                          const segmentosDetectados = item.raw_variante
                            .split(" / ")
                            .map((segmento) => parseAttributeSegment(segmento))
                            .filter(
                              (
                                segmento,
                              ): segmento is {
                                nombre: string;
                                valor: string;
                              } => segmento !== null,
                            );

                          return (
                            <div key={idx} className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 bg-background border border-border/80 px-2 py-1 rounded text-xs text-muted-foreground">
                                <Layers className="w-3 h-3 opacity-60" />
                                <span className="truncate max-w-[150px]">
                                  {item.raw_variante}
                                </span>
                                <span className="font-semibold text-emerald-600 ">
                                  +{item.cantidad}
                                </span>
                              </div>
                              {segmentosDetectados.length > 0 && (
                                <div className="flex flex-wrap gap-1 pl-1">
                                  {segmentosDetectados.map(
                                    (segmento, segIdx) => (
                                      <span
                                        key={`${segmento.nombre}-${segIdx}`}
                                        className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground font-semibold border border-border/50"
                                      >
                                        {segmento.nombre}: {segmento.valor}
                                      </span>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs font-semibold text-muted-foreground">
                        Total a ingresar:{" "}
                        <span className="text-foreground">
                          {totalGroupStock} u.
                        </span>
                      </div>
                    </td>

                    {/* VINCULACIÓN EN SISTEMA */}
                    <td className="px-6 py-4 align-top pt-5">
                      {isDesconocido ? (
                        <div className="flex flex-col gap-2 relative">
                          <SearchableSelect
                            productos={localProductos}
                            value={firstItem.producto_id || null}
                            onSelect={(value) =>
                              handleAssignProduct(rawNombre, value)
                            }
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs border-dashed text-primary hover:bg-primary/10 hover:text-primary hover:border-primary w-full justify-start"
                            onClick={() => {
                              setGroupToCreateName(rawNombre);

                              // Si ya hay un precio calculado para esta fila (recargo global
                              // aplicado o edición manual), lo usamos como sugerencia.
                              // Si no, caemos al fallback por defecto de costo + 50%.
                              const recargoYaAplicado =
                                (firstItem.precio_venta_actualizado || 0) > 0;
                              const precioSugerido = recargoYaAplicado
                                ? (firstItem.precio_venta_actualizado as number)
                                : Math.ceil(firstItem.precio_costo * 1.5);

                              const origenPrecio = recargoYaAplicado
                                ? `Costo $${firstItem.precio_costo.toLocaleString("es-AR")} + ${(
                                    ((precioSugerido - firstItem.precio_costo) /
                                      firstItem.precio_costo) *
                                    100
                                  ).toFixed(1)}% recargo = $${precioSugerido.toLocaleString("es-AR")}`
                                : "Precio sugerido por defecto (sin recargo aplicado todavía)";

                              setNuevoProductoData({
                                nombre: rawNombre,
                                precio: precioSugerido,
                                categoria: firstItem.raw_categoria || "",
                                origenPrecio,
                              });
                            }}
                          >
                            <PlusCircle className="w-4 h-4 mr-2" /> Crear
                            Producto Nuevo
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2 p-2 bg-background border border-border/60 rounded-md">
                          <div>
                            <p className="font-semibold text-primary flex items-center gap-1.5">
                              {pReal?.nombre}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Asignado a {group.length} variantes
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                            onClick={() => handleUndo(rawNombre)}
                            title="Deshacer asignación para todo el grupo"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </td>

                    {/* COSTO UNITARIO */}
                    <td className="px-6 py-4 text-right align-top pt-5">
                      <p className="font-semibold text-foreground">
                        $
                        {Number(firstItem.precio_costo).toLocaleString("es-AR")}
                      </p>
                      {isInflacion && pReal && (
                        <p
                          className="text-xs text-amber-600 font-semibold line-through mt-0.5"
                          title="Costo anterior en sistema"
                        >
                          Era $
                          {Number(pReal.precio_costo).toLocaleString("es-AR")}
                        </p>
                      )}
                    </td>

                    {/* PRECIO PÚBLICO (Unificado para todo el grupo) */}
                    <td className="px-6 py-4 text-right align-top pt-5">
                      {firstItem.producto_id ? (
                        <div className="flex justify-end">
                          <div className="relative w-28">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                              $
                            </span>
                            <Input
                              type="number"
                              className={`pl-7 h-9 font-semibold text-right ${
                                isInflacion
                                  ? "border-amber-400 bg-amber-50 focus-visible:ring-amber-500"
                                  : "bg-background"
                              }`}
                              value={firstItem.precio_venta_actualizado || 0}
                              onChange={(e) =>
                                handleUpdatePrice(
                                  rawNombre,
                                  Number(e.target.value),
                                )
                              }
                              title="Este precio se aplicará al producto padre y sus variantes"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic mr-2">
                          Esperando asignación...
                        </span>
                      )}
                    </td>

                    {/* DESCARTAR GRUPO */}
                    <td className="px-4 py-4 text-center align-top pt-5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => setGroupToRemoveName(rawNombre)}
                        title="Descartar todo este grupo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para Crear Al Vuelo */}
      <Dialog
        open={groupToCreateName !== null}
        onOpenChange={(open) => !open && setGroupToCreateName(null)}
      >
        <DialogContent aria-describedby="crear-producto-description">
          <DialogHeader>
            <DialogTitle>Crear Producto Múltiple</DialogTitle>
            <DialogDescription id="crear-producto-description">
              Se creará este producto y se le asociarán las variantes detectadas
              automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nombre del Producto Central</Label>
              <Input
                value={nuevoProductoData.nombre}
                onChange={(e) =>
                  setNuevoProductoData({
                    ...nuevoProductoData,
                    nombre: e.target.value,
                  })
                }
                placeholder="Ej: Ficus Benjamina"
              />
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={nuevoProductoData.categoria}
                onValueChange={(val) =>
                  setNuevoProductoData({ ...nuevoProductoData, categoria: val })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una categoría..." />
                </SelectTrigger>
                <SelectContent className="max-h-50">
                  {categoriasDB.map((cat) => (
                    <SelectItem key={cat.id} value={cat.nombre}>
                      {cat.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Precio Público Unificado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  $
                </span>
                <Input
                  type="number"
                  className="pl-7"
                  value={nuevoProductoData.precio}
                  onChange={(e) =>
                    setNuevoProductoData({
                      ...nuevoProductoData,
                      precio: Number(e.target.value),
                    })
                  }
                />
              </div>
              {nuevoProductoData.origenPrecio && (
                <p className="text-xs text-muted-foreground">
                  {nuevoProductoData.origenPrecio}
                </p>
              )}
              {grupoTieneCostoDisperso && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-2.5 mt-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 font-medium leading-tight">
                    Este grupo tiene variantes con distinto costo — se va a
                    aplicar el precio calculado por variante, no un valor
                    único.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setGroupToCreateName(null)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCrearAlVuelo}
                disabled={isSubmitting}
                className="bg-primary"
              >
                {isSubmitting ? "Creando..." : "Guardar y Asignar Todo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación para Descartar Grupo */}
      <AlertDialog
        open={groupToRemoveName !== null}
        onOpenChange={(open) => !open && setGroupToRemoveName(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar grupo completo?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de ignorar{" "}
              <strong className="text-foreground">{groupToRemoveName}</strong> y
              todas sus variantes de este remito. No se impactará stock ni
              precios para este producto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setGroupToRemoveName(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveGroup}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
