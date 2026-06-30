"use client";

import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { ItemResuelto, OrdenCompra } from "@/entities/compras/types";
import { Producto } from "@/entities/productos/types";
import { createClient } from "@/shared/config/supabase/client";

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
          className={`truncate ${selectedProduct ? "text-foreground" : "text-muted-foreground"}`}
        >
          {selectedProduct
            ? `${selectedProduct.nombre} (${selectedProduct.tipo})`
            : "-- Buscar Producto --"}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50 shrink-0 ml-2" />
      </div>

      {/* Contenido del Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-border rounded-md shadow-md outline-none animate-in fade-in-0 zoom-in-95">
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
  const [itemToRemoveIdx, setItemToRemoveIdx] = useState<number | null>(null);

  // Estado local para productos (permite inyectar los creados al vuelo)
  const [localProductos, setLocalProductos] = useState<Producto[]>(productos);

  // Estado local para los ítems
  const [items, setItems] = useState<ItemResueltoConCategoria[]>(() =>
    itemsOriginales.map((item) => ({
      ...item,
      variante_match: item.variante_match || item.raw_variante || "Unico",
      precio_venta_actualizado:
        productoReal(item.producto_id, productos)?.precio || 0,
    })),
  );

  // Estados para nuevas funcionalidades
  const [margenGlobal, setMargenGlobal] = useState<number | "">("");
  const [itemToCreateIdx, setItemToCreateIdx] = useState<number | null>(null);
  const [nuevoProductoData, setNuevoProductoData] = useState({
    nombre: "",
    precio: 0,
    categoria: "",
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

  // --- Handlers Básicos ---
  const handleAssignProduct = (itemIndex: number, newProductId: string) => {
    const newItems = [...items];
    const prod = productoReal(newProductId);

    newItems[itemIndex].producto_id = newProductId;
    newItems[itemIndex].precio_venta_actualizado = prod?.precio || 0;

    if (newItems[itemIndex].estado_match === "DESCONOCIDO") {
      newItems[itemIndex].estado_match = "NUEVO_ALIAS";
    }

    setItems(newItems);
  };

  const handleUpdatePrice = (itemIndex: number, newPrice: number) => {
    const newItems = [...items];
    newItems[itemIndex].precio_venta_actualizado = newPrice;
    setItems(newItems);
  };

  const confirmRemoveItem = () => {
    if (itemToRemoveIdx === null) return;

    const newItems = items.filter((_, idx) => idx !== itemToRemoveIdx);
    setItems(newItems);
    setItemToRemoveIdx(null);
    toast.info("Ítem descartado de la conciliación.");
  };

  const handleUndo = (itemIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex].producto_id = null;
    newItems[itemIndex].precio_venta_actualizado = 0;
    newItems[itemIndex].estado_match = "DESCONOCIDO";
    setItems(newItems);
    toast.info("Asignación deshecha.");
  };

  const handleAplicarMargenGlobal = () => {
    if (margenGlobal === "" || margenGlobal < 0) return;

    const newItems = items.map((item) => ({
      ...item,
      // Calculamos el nuevo precio sumando el porcentaje al costo
      precio_venta_actualizado: Math.ceil(
        item.precio_costo * (1 + Number(margenGlobal) / 100),
      ),
    }));

    setItems(newItems);
    toast.success(
      `Margen del ${margenGlobal}% aplicado a todos los productos.`,
    );
  };

  // --- NUEVO: Crear al Vuelo ---
  const handleCrearAlVuelo = async () => {
    if (itemToCreateIdx === null) return;

    const itemActual = items[itemToCreateIdx];

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
    setLocalProductos([...localProductos, nuevoProd]);

    const newItems = [...items];
    newItems[itemToCreateIdx].producto_id = nuevoProd.id;
    newItems[itemToCreateIdx].precio_venta_actualizado = nuevoProd.precio;
    newItems[itemToCreateIdx].estado_match = "NUEVO_ALIAS";
    setItems(newItems);

    toast.success("Producto creado y asignado con éxito.");
    setItemToCreateIdx(null); // Cerrar modal
  };

  const handleAprobar = async () => {
    const sinResolver = items.some((i) => !i.producto_id);
    if (sinResolver) {
      toast.error(
        "Debes asignar un producto a todos los ítems desconocidos (Rojos).",
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
          disabled={isSubmitting}
        >
          <Save className="w-5 h-5 mr-2" />
          {isSubmitting ? "Procesando..." : "Confirmar e Impactar Stock"}
        </Button>
      </div>

      {/* Acciones Rápidas (Margen Global) */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-background p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Percent className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium whitespace-nowrap">
            Aplicar margen global a todos:
          </span>
          <Input
            type="number"
            placeholder="Ej: 30"
            className="w-20 h-8 text-center"
            value={margenGlobal}
            onChange={(e) =>
              setMargenGlobal(e.target.value ? Number(e.target.value) : "")
            }
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAplicarMargenGlobal}
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
          <HelpCircle className="w-4 h-4 mr-2" /> Desconocido
        </Badge>
      </div>

      {/* Tabla Interactiva */}
      <div className="bg-background rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-foreground/80 text-xs uppercase font-semibold tracking-wide">
            <tr>
              <th className="px-6 py-2">Estado</th>
              <th className="px-6 py-2">Ítem del Proveedor</th>
              <th className="px-6 py-2">Producto en Sistema</th>
              <th className="px-6 py-2 text-center">Cant.</th>
              <th className="px-6 py-2 text-right">Costo Unidad</th>
              <th className="px-6 py-2 text-right min-w-40">Precio Público</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, idx) => {
              const pReal = productoReal(item.producto_id);
              const isPerfecto =
                item.estado_match === "PERFECTO" ||
                item.estado_match === "NUEVO_ALIAS";
              const isInflacion = item.estado_match === "MODIFICADO";
              const isDesconocido = item.estado_match === "DESCONOCIDO";

              let rowClassName = "hover:bg-muted/30";
              if (isInflacion) rowClassName = "bg-amber-50/30";
              else if (isDesconocido) rowClassName = "bg-rose-50/30";

              return (
                <tr
                  key={item.id ?? `item-${idx}`}
                  className={`transition-colors ${rowClassName}`}
                >
                  <td className="px-6 py-4">
                    {isPerfecto && (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    )}
                    {isInflacion && (
                      <span title="El costo subió">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                      </span>
                    )}
                    {isDesconocido && (
                      <span title="No se encontró alias">
                        <HelpCircle className="w-6 h-6 text-rose-500 animate-pulse" />
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <p className="font-semibold text-foreground uppercase tracking-wide">
                      {item.raw_nombre}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Variante: {item.raw_variante}
                    </p>
                  </td>

                  <td className="px-6 py-4 min-w-70">
                    {isDesconocido ? (
                      <div className="flex flex-col gap-2 relative">
                        {/* AQUÍ SE REEMPLAZA EL COMPONENTE SELECT POR EL BUSCADOR */}
                        <SearchableSelect
                          productos={localProductos}
                          value={item.producto_id || null}
                          onSelect={(value) => handleAssignProduct(idx, value)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-dashed text-primary hover:bg-primary/10 hover:text-primary hover:border-primary"
                          onClick={() => {
                            setItemToCreateIdx(idx);
                            setNuevoProductoData({
                              nombre: item.raw_nombre,
                              precio: Math.ceil(item.precio_costo * 1.5),
                              categoria: (item as any).raw_categoria || "",
                            });
                          }}
                        >
                          <PlusCircle className="w-3 h-3 mr-1" /> Crear &quot;
                          {item.raw_nombre}&quot;
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-primary">
                            {pReal?.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Asignado a variante: {item.variante_match}
                          </p>
                        </div>
                        {/* Botón de Deshacer */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                          onClick={() => handleUndo(idx)}
                          title="Deshacer asignación"
                        >
                          <Undo2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-2 text-center font-semibold">
                    +{item.cantidad}
                  </td>

                  <td className="px-6 py-2 text-right">
                    <p className="font-semibold text-foreground">
                      ${Number(item.precio_costo).toLocaleString("es-AR")}
                    </p>
                    {isInflacion && pReal && (
                      <p className="text-xs text-amber-600 font-semibold line-through mt-0.5">
                        Era $
                        {Number(pReal.precio_costo).toLocaleString("es-AR")}
                      </p>
                    )}
                  </td>

                  <td className="px-6 py-2 text-right">
                    {item.producto_id ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="relative w-28">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                            $
                          </span>
                          <Input
                            type="number"
                            className={`pl-7 h-9 font-semibold text-right ${isInflacion ? "border-amber-400 bg-amber-50 focus-visible:ring-amber-500" : ""}`}
                            value={item.precio_venta_actualizado || 0}
                            onChange={(e) =>
                              handleUpdatePrice(idx, Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        Esperando...
                      </span>
                    )}
                  </td>

                  {/* Columna del botón Descartar */}
                  <td className="px-4 py-4 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => setItemToRemoveIdx(idx)}
                      title="Descartar ítem del remito"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal para Crear Al Vuelo */}
      <Dialog
        open={itemToCreateIdx !== null}
        onOpenChange={(open) => !open && setItemToCreateIdx(null)}
      >
        <DialogContent aria-describedby="crear-producto-description">
          <DialogHeader>
            <DialogTitle>Crear Producto</DialogTitle>
            <DialogDescription
              id="crear-producto-description"
              className="sr-only"
            >
              Completa los datos para crear un nuevo producto en el sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nombre del Producto</Label>
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
              <Label>Precio Público</Label>
              <Input
                type="number"
                value={nuevoProductoData.precio}
                onChange={(e) =>
                  setNuevoProductoData({
                    ...nuevoProductoData,
                    precio: Number(e.target.value),
                  })
                }
                placeholder="Ej: 1500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setItemToCreateIdx(null)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button onClick={handleCrearAlVuelo} disabled={isSubmitting}>
                {isSubmitting ? "Creando..." : "Guardar y Asignar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación para Descartar */}
      <AlertDialog
        open={itemToRemoveIdx !== null}
        onOpenChange={(open) => !open && setItemToRemoveIdx(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar este ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de ignorar el ítem{" "}
              <strong className="text-foreground font-semibold">
                {itemToRemoveIdx !== null
                  ? items[itemToRemoveIdx]?.raw_nombre
                  : ""}
              </strong>{" "}
              de la conciliación actual. No se impactará su stock ni se
              actualizará su precio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToRemoveIdx(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveItem}
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
