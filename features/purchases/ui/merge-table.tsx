"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  aprobarOrdenAction,
  crearProductoAlVueloAction,
} from "../actions/merge-purchase";
import {
  getMergeDraft,
  saveMergeDraft,
  deleteMergeDraft,
} from "../lib/merge-draft-db";
import { queryKeys } from "@/shared/lib/query-keys";
import { withTimeout, TimeoutError } from "@/shared/utils/with-timeout";
import { runWithConcurrencyLimit } from "@/shared/utils/concurrency";
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
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  ItemResuelto,
  OrdenCompra,
  SugerenciaSimilitud,
} from "@/entities/compras/types";
import { Producto } from "@/entities/productos/types";
import { createClient } from "@/shared/config/supabase/client";
import { parseAttributeSegment } from "@/entities/productos/lib/parse-variant-attributes";
import { ProductMediaSection } from "@/features/stock/ui/create-product/product-media-section";
import { optimizarImagenProducto } from "@/shared/utils/image-optimizer";
import {
  clasificarDesconocido,
  construirMapaSimilares,
  BucketDesconocido,
} from "../lib/match-classification";

interface MergeTableProps {
  orden: OrdenCompra;
  itemsOriginales: ItemResuelto[];
  productos: Producto[];
  sugerenciasSimilitud: SugerenciaSimilitud[];
}

type ItemResueltoConCategoria = ItemResuelto & {
  raw_categoria?: string | null;
};

// Timeout de UI para las acciones de red disparadas desde esta pantalla:
// si no responden a tiempo, se tratan como error y el botón se destraba
// en vez de quedar "cargando" para siempre.
const ACTION_TIMEOUT_MS = 25_000;

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
        className="flex items-center justify-between w-full h-10 px-3 py-2 text-sm bg-card border border-border rounded-md cursor-pointer"
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
  sugerenciasSimilitud,
}: Readonly<MergeTableProps>) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estado de red por acción — separados para que un "crear producto"
  // colgado no bloquee el botón de aprobar (y viceversa).
  const [crearLoading, setCrearLoading] = useState(false);
  const [crearError, setCrearError] = useState<string | null>(null);
  const [aprobarLoading, setAprobarLoading] = useState(false);
  const [aprobarError, setAprobarError] = useState<string | null>(null);

  // Loading/error por fila para las acciones de 1-click y masivas — separado
  // de crearLoading/crearError, que siguen siendo solo del modal manual.
  const [loadingPorGrupo, setLoadingPorGrupo] = useState<Record<string, boolean>>({});
  const [errorPorGrupo, setErrorPorGrupo] = useState<Record<string, string | null>>({});

  // Categoría elegida a mano por el usuario (override), por raw_nombre —
  // independiente del modal. Si no hay override, se usa la sugerencia
  // automática de sugerirCategoria calculada en clasificacionPorGrupo.
  const [categoriaPorGrupo, setCategoriaPorGrupo] = useState<Record<string, string>>({});

  // Selección múltiple de filas Ambiguas, para "Asignar categoría a selección".
  const [gruposSeleccionados, setGruposSeleccionados] = useState<Set<string>>(
    new Set(),
  );
  const [categoriaParaSeleccion, setCategoriaParaSeleccion] = useState("");
  const [bulkCrearLoading, setBulkCrearLoading] = useState(false);

  // Borrador local (IndexedDB) de esta conciliación
  const [draftState, setDraftState] = useState<
    "checking" | "prompt" | "ready"
  >("checking");
  const [pendingDraft, setPendingDraft] =
    useState<Awaited<ReturnType<typeof getMergeDraft>>>(null);

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

  // Snapshot del estado prístino (sin tocar), para no ofrecer "restaurar
  // borrador" ni pisar un borrador real cuando el usuario todavía no hizo
  // ningún cambio en esta sesión.
  const pristineItemsSnapshotRef = useRef<string>(JSON.stringify(items));

  // Agrupación Computada Dinámicamente para Renderizar
  const groupedItems = useMemo(() => {
    const map = new Map<string, ItemResueltoConCategoria[]>();
    items.forEach((item) => {
      if (!map.has(item.raw_nombre)) map.set(item.raw_nombre, []);
      map.get(item.raw_nombre)!.push(item);
    });
    return Array.from(map.entries());
  }, [items]);

  // Candidatos de "posible match" (similitud de texto), 1 por raw_nombre.
  const similaresMap = useMemo(
    () => construirMapaSimilares(sugerenciasSimilitud),
    [sugerenciasSimilitud],
  );

  // Clasificación de las 3 filas "no reconocido" (posible match / nuevo
  // sugerido / ambiguo), calculada 1 vez por raw_nombre DESCONOCIDO.
  const clasificacionPorGrupo = useMemo(() => {
    const mapa = new Map<string, BucketDesconocido>();
    for (const [rawNombre, group] of groupedItems) {
      if (group[0].estado_match === "DESCONOCIDO") {
        mapa.set(rawNombre, clasificarDesconocido(rawNombre, similaresMap));
      }
    }
    return mapa;
  }, [groupedItems, similaresMap]);

  // Cuántos grupos están en el bucket "nuevo sugerido" — usado para
  // habilitar/mostrar el botón de creación masiva.
  const gruposNuevoSugerido = useMemo(
    () =>
      groupedItems
        .filter(([rawNombre]) => clasificacionPorGrupo.get(rawNombre)?.tipo === "NUEVO_SUGERIDO")
        .map(([rawNombre]) => rawNombre),
    [groupedItems, clasificacionPorGrupo],
  );

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
  const [archivosNuevoProducto, setArchivosNuevoProducto] = useState<File[]>(
    [],
  );
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

  // Busca un borrador guardado de ESTA orden al entrar a la pantalla.
  useEffect(() => {
    let cancelled = false;
    getMergeDraft(orden.id)
      .then((draft) => {
        if (cancelled) return;
        if (draft && draft.items.length > 0) {
          setPendingDraft(draft);
          setDraftState("prompt");
        } else {
          setDraftState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setDraftState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [orden.id]);

  // Autoguardado del borrador local — solo una vez que se resolvió si
  // había (y qué hacer con) un borrador previo, y solo si hay cambios
  // reales sobre el estado prístino.
  useEffect(() => {
    if (draftState !== "ready") return;

    const productosCreados = localProductos.filter(
      (p) => !productos.some((orig) => orig.id === p.id),
    );
    const serializedItems = JSON.stringify(items);
    if (
      serializedItems === pristineItemsSnapshotRef.current &&
      productosCreados.length === 0
    ) {
      return;
    }

    const timer = setTimeout(() => {
      saveMergeDraft({
        ordenId: orden.id,
        items,
        productosCreados,
        actualizadoEn: Date.now(),
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [items, localProductos, productos, draftState, orden.id]);

  const handleRestaurarDraft = () => {
    if (pendingDraft) {
      setItems(pendingDraft.items);
      if (pendingDraft.productosCreados.length > 0) {
        setLocalProductos((prev) => {
          const existentes = new Set(prev.map((p) => p.id));
          const nuevos = pendingDraft.productosCreados.filter(
            (p) => !existentes.has(p.id),
          );
          return [...prev, ...nuevos];
        });
      }
      toast.info("Continuando donde quedaste.");
    }
    setPendingDraft(null);
    setDraftState("ready");
  };

  const handleDescartarDraft = () => {
    deleteMergeDraft(orden.id).catch(() => {});
    setPendingDraft(null);
    setDraftState("ready");
  };

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

  // --- Crear al Vuelo (compartido por el modal manual, el 1-click y el masivo) ---
  // Nunca throwea — siempre resuelve a un resultado, así los callers (loop
  // masivo incluido) no necesitan try/catch propio.
  async function crearYAsignarProducto(params: {
    rawNombre: string;
    nombreProducto: string;
    categoria: string;
    precio: number;
    archivosMain?: File[];
    archivosThumb?: File[];
    archivosGrid?: File[];
  }): Promise<
    { ok: true; producto: Producto } | { ok: false; error: string }
  > {
    const itemActual = items.find((i) => i.raw_nombre === params.rawNombre);
    if (!itemActual) {
      return { ok: false, error: "No se encontró el ítem en la conciliación." };
    }

    try {
      const res = await withTimeout(
        crearProductoAlVueloAction(
          params.nombreProducto,
          itemActual.precio_costo,
          params.precio,
          params.archivosMain || [],
          params.archivosThumb || [],
          params.archivosGrid || [],
          params.categoria,
        ),
        ACTION_TIMEOUT_MS,
      );

      if (res.error || !res.producto) {
        return { ok: false, error: res.error || "Ocurrió un error al crear." };
      }

      const nuevoProd = res.producto as Producto;
      setLocalProductos((prevProductos) => [...prevProductos, nuevoProd]);
      queryClient.invalidateQueries({ queryKey: queryKeys.stock.index });
      queryClient.invalidateQueries({ queryKey: queryKeys.pos.productos });

      const precioUnificado = Number(params.precio || nuevoProd.precio || 0);
      setItems((prevItems) =>
        prevItems.map((item) => {
          if (item.raw_nombre !== params.rawNombre) return item;

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

      return { ok: true, producto: nuevoProd };
    } catch (err) {
      const message =
        err instanceof TimeoutError
          ? "La creación tardó demasiado y se canceló. Probá de nuevo."
          : err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado al crear el producto.";
      return { ok: false, error: message };
    }
  }

  const handleCrearAlVuelo = async () => {
    if (!groupToCreateName) return;

    setCrearLoading(true);
    setCrearError(null);

    try {
      // Comprimimos generando las tres versiones (main + thumbnail + grid)
      const imagenesProcesadas =
        archivosNuevoProducto.length > 0
          ? await Promise.all(
              archivosNuevoProducto.map((f) => optimizarImagenProducto(f)),
            )
          : [];

      const archivosMain = imagenesProcesadas.map((img) => img.main);
      const archivosThumb = imagenesProcesadas.map((img) => img.thumbnail);
      const archivosGrid = imagenesProcesadas.map((img) => img.grid);

      const resultado = await crearYAsignarProducto({
        rawNombre: groupToCreateName,
        nombreProducto: nuevoProductoData.nombre,
        categoria: nuevoProductoData.categoria,
        precio: nuevoProductoData.precio,
        archivosMain,
        archivosThumb,
        archivosGrid,
      });

      if (!resultado.ok) {
        setCrearError(resultado.error);
        return;
      }

      toast.success(
        `Producto "${resultado.producto.nombre}" creado y asignado a ${items.filter((i) => i.raw_nombre === groupToCreateName).length} variantes.`,
      );
      setGroupToCreateName(null);
      setArchivosNuevoProducto([]);
    } finally {
      setCrearLoading(false);
    }
  };

  // --- 1-click: bucket (b) Nuevo Sugerido ---
  const handleCrearSugerido = async (
    rawNombre: string,
    categoriaSugerida: string,
  ) => {
    const itemActual = items.find((i) => i.raw_nombre === rawNombre);
    if (!itemActual) return;

    const categoria = categoriaPorGrupo[rawNombre] ?? categoriaSugerida;
    const precio = Math.ceil(itemActual.precio_costo * 1.5);

    setLoadingPorGrupo((prev) => ({ ...prev, [rawNombre]: true }));
    setErrorPorGrupo((prev) => ({ ...prev, [rawNombre]: null }));

    const resultado = await crearYAsignarProducto({
      rawNombre,
      nombreProducto: rawNombre,
      categoria,
      precio,
    });

    setLoadingPorGrupo((prev) => ({ ...prev, [rawNombre]: false }));

    if (!resultado.ok) {
      setErrorPorGrupo((prev) => ({ ...prev, [rawNombre]: resultado.error }));
      return;
    }

    toast.success(`"${resultado.producto.nombre}" creado en "${categoria}".`);
  };

  // --- T3: acciones masivas ---

  const toggleGrupoSeleccionado = (rawNombre: string) => {
    setGruposSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(rawNombre)) next.delete(rawNombre);
      else next.add(rawNombre);
      return next;
    });
  };

  const handleAsignarCategoriaASeleccion = () => {
    if (!categoriaParaSeleccion || gruposSeleccionados.size === 0) return;

    setCategoriaPorGrupo((prev) => {
      const next = { ...prev };
      for (const rawNombre of gruposSeleccionados) {
        next[rawNombre] = categoriaParaSeleccion;
      }
      return next;
    });

    toast.success(
      `Categoría "${categoriaParaSeleccion}" asignada a ${gruposSeleccionados.size} agrupaciones. Ahora podés usar "Crear" en cada una.`,
    );
    setGruposSeleccionados(new Set());
    setCategoriaParaSeleccion("");
  };

  const handleCrearTodosSugeridos = async () => {
    if (gruposNuevoSugerido.length === 0 || bulkCrearLoading) return;

    setBulkCrearLoading(true);
    setLoadingPorGrupo((prev) => {
      const next = { ...prev };
      for (const rawNombre of gruposNuevoSugerido) next[rawNombre] = true;
      return next;
    });

    const tareas = gruposNuevoSugerido.map((rawNombre) => async () => {
      const bucket = clasificacionPorGrupo.get(rawNombre);
      const categoriaSugerida =
        bucket?.tipo === "NUEVO_SUGERIDO"
          ? bucket.categoriaSugerida.categoriaNombre
          : "";
      const categoria = categoriaPorGrupo[rawNombre] ?? categoriaSugerida;
      const itemActual = items.find((i) => i.raw_nombre === rawNombre);
      const precio = Math.ceil((itemActual?.precio_costo || 0) * 1.5);

      const resultado = await crearYAsignarProducto({
        rawNombre,
        nombreProducto: rawNombre,
        categoria,
        precio,
      });

      setLoadingPorGrupo((prev) => ({ ...prev, [rawNombre]: false }));
      setErrorPorGrupo((prev) => ({
        ...prev,
        [rawNombre]: resultado.ok ? null : resultado.error,
      }));

      return resultado.ok;
    });

    const resultados = await runWithConcurrencyLimit(tareas, 3);
    setBulkCrearLoading(false);

    const exitosos = resultados.filter(Boolean).length;
    const fallidos = resultados.length - exitosos;

    if (fallidos === 0) {
      toast.success(`Se crearon ${exitosos} productos sugeridos.`);
    } else {
      toast.warning(
        `Creados ${exitosos}/${resultados.length}. ${fallidos} fallaron — reintentalos individualmente (quedaron marcados en rojo).`,
      );
    }
  };

  const handleAprobar = async () => {
    const sinResolver = items.some((i) => !i.producto_id);
    if (sinResolver) {
      toast.error(
        "Debes asignar un producto a todas las agrupaciones desconocidas (Rojas).",
      );
      return;
    }

    setAprobarLoading(true);
    setAprobarError(null);
    toast.info("Impactando stock y precios...");

    try {
      const res = await withTimeout(
        aprobarOrdenAction(orden.id, orden.proveedor, items),
        ACTION_TIMEOUT_MS,
      );

      if (res.success) {
        toast.success("¡Orden conciliada! Stock actualizado.");
        queryClient.invalidateQueries({ queryKey: queryKeys.stock.index });
        queryClient.invalidateQueries({ queryKey: queryKeys.pos.productos });
        // Guardado real confirmado contra el server: el borrador local ya
        // no tiene sentido, no debe quedar un borrador fantasma.
        await deleteMergeDraft(orden.id).catch(() => {});
        router.push("/stock");
      } else {
        setAprobarError(res.error || "Ocurrió un error.");
      }
    } catch (err) {
      setAprobarError(
        err instanceof TimeoutError
          ? "La operación tardó demasiado y se canceló. Tu progreso sigue guardado localmente, podés reintentar."
          : err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado al impactar los datos.",
      );
    } finally {
      setAprobarLoading(false);
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
        <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
          <Button
            size="lg"
            className="h-10 bg-primary hover:bg-primary/90 text-white w-full sm:w-auto cursor-pointer"
            onClick={handleAprobar}
            disabled={aprobarLoading || crearLoading || items.length === 0}
          >
            <Save className="w-5 h-5 mr-2" />
            {aprobarLoading
              ? "Procesando..."
              : aprobarError
                ? "Reintentar"
                : "Confirmar e Impactar Stock"}
          </Button>
          {aprobarError && (
            <p className="text-xs text-rose-600 font-medium max-w-sm text-right">
              {aprobarError}
            </p>
          )}
        </div>
      </div>

      {/* Acciones Rápidas (Recargo Global + Masivas) */}
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
          >
            Aplicar
          </Button>
        </div>

        {gruposNuevoSugerido.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="bg-violet-100 text-violet-700 hover:bg-violet-200 w-full sm:w-auto"
            onClick={handleCrearTodosSugeridos}
            disabled={bulkCrearLoading}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {bulkCrearLoading
              ? "Creando..."
              : `Crear todos los sugeridos (${gruposNuevoSugerido.length})`}
          </Button>
        )}
      </div>

      {/* Barra de selección múltiple (solo Ambiguo) */}
      {gruposSeleccionados.size > 0 && (
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-rose-50 border border-rose-200 p-3 rounded-xl">
          <span className="text-sm font-semibold text-rose-800 whitespace-nowrap">
            {gruposSeleccionados.size} agrupaciones seleccionadas
          </span>
          <Select
            value={categoriaParaSeleccion}
            onValueChange={setCategoriaParaSeleccion}
          >
            <SelectTrigger className="w-full sm:w-64 h-8 bg-background">
              <SelectValue placeholder="Elegir categoría para todas..." />
            </SelectTrigger>
            <SelectContent className="max-h-50">
              {categoriasDB.map((cat) => (
                <SelectItem key={cat.id} value={cat.nombre}>
                  {cat.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-rose-600 hover:bg-rose-700 text-white w-full sm:w-auto"
            disabled={!categoriaParaSeleccion}
            onClick={handleAsignarCategoriaASeleccion}
          >
            Asignar categoría a selección
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full sm:w-auto"
            onClick={() => setGruposSeleccionados(new Set())}
          >
            Cancelar selección
          </Button>
        </div>
      )}

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
          className="bg-sky-50 text-sky-700 border-sky-200 px-3 py-1"
        >
          <Search className="w-4 h-4 mr-2" /> Posible Match Existente
        </Badge>
        <Badge
          variant="outline"
          className="bg-violet-50 text-violet-700 border-violet-200 px-3 py-1"
        >
          <Sparkles className="w-4 h-4 mr-2" /> Nuevo (Categoría Sugerida)
        </Badge>
        <Badge
          variant="outline"
          className="bg-rose-50 text-rose-700 border-rose-200 px-3 py-1"
        >
          <HelpCircle className="w-4 h-4 mr-2" /> Ambiguo / Sin Sugerencia
        </Badge>
      </div>

      {/* Tabla Interactiva Agrupada */}
      <div className="bg-background rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-250">
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
                const bucket = isDesconocido
                  ? clasificacionPorGrupo.get(rawNombre)
                  : undefined;
                const posibleMatch =
                  bucket?.tipo === "POSIBLE_MATCH" ? bucket : null;
                const nuevoSugerido =
                  bucket?.tipo === "NUEVO_SUGERIDO" ? bucket : null;
                const isAmbiguo =
                  isDesconocido && !posibleMatch && !nuevoSugerido;
                const totalGroupStock = group.reduce(
                  (sum, i) => sum + i.cantidad,
                  0,
                );

                let rowClassName = "hover:bg-muted/30";
                if (isInflacion)
                  rowClassName = "bg-amber-50/30 hover:bg-amber-50/50";
                else if (posibleMatch)
                  rowClassName = "bg-sky-50/30 hover:bg-sky-50/50";
                else if (nuevoSugerido)
                  rowClassName = "bg-violet-50/20 hover:bg-violet-50/40";
                else if (isAmbiguo)
                  rowClassName = "bg-rose-50/10 hover:bg-rose-50/20";

                return (
                  <tr
                    key={rawNombre}
                    className={`transition-colors ${rowClassName}`}
                  >
                    {/* STATUS */}
                    <td className="px-6 py-4 text-center align-top pt-5">
                      {isAmbiguo && (
                        <input
                          type="checkbox"
                          className="mb-1.5 w-4 h-4 accent-rose-600 cursor-pointer"
                          checked={gruposSeleccionados.has(rawNombre)}
                          onChange={() => toggleGrupoSeleccionado(rawNombre)}
                          title="Seleccionar para asignar categoría en lote"
                        />
                      )}
                      {isPerfecto && (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      )}
                      {isInflacion && (
                        <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
                      )}
                      {posibleMatch && (
                        <Search className="w-6 h-6 text-sky-500 mx-auto" />
                      )}
                      {nuevoSugerido && (
                        <Sparkles className="w-6 h-6 text-violet-500 mx-auto" />
                      )}
                      {isAmbiguo && (
                        <HelpCircle className="w-6 h-6 text-rose-500 mx-auto" />
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
                                <span className="truncate max-w-37">
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
                      {(() => {
                        const abrirModalManual = () => {
                          setGroupToCreateName(rawNombre);
                          setCrearError(null);

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
                              ).toFixed(
                                1,
                              )}% recargo = $${precioSugerido.toLocaleString("es-AR")}`
                            : "Precio sugerido por defecto (sin recargo aplicado todavía)";

                          setNuevoProductoData({
                            nombre: rawNombre,
                            precio: precioSugerido,
                            categoria:
                              categoriaPorGrupo[rawNombre] ??
                              nuevoSugerido?.categoriaSugerida.categoriaNombre ??
                              firstItem.raw_categoria ??
                              "",
                            origenPrecio,
                          });
                          setArchivosNuevoProducto([]);
                        };

                        const fallbackManual = (
                          <>
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
                              className="h-8 text-xs border-dashed text-foreground hover:border-primary w-full justify-start"
                              onClick={abrirModalManual}
                            >
                              <PlusCircle className="w-4 h-4 mr-2" />
                              Crear Producto Nuevo
                            </Button>
                          </>
                        );

                        if (posibleMatch) {
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-2 p-2 bg-sky-50/60 border border-sky-200 rounded-md">
                                <div className="min-w-0">
                                  <p className="font-semibold text-sky-700 flex items-center gap-1.5 truncate">
                                    <Search className="w-3.5 h-3.5 shrink-0" />
                                    {posibleMatch.candidato.nombre}
                                  </p>
                                  <p className="text-[11px] text-sky-700/70 mt-0.5">
                                    ~{Math.round(posibleMatch.candidato.score * 100)}%
                                    similar — ¿es este producto?
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-sky-600 hover:bg-sky-700 text-white shrink-0"
                                  onClick={() =>
                                    handleAssignProduct(
                                      rawNombre,
                                      posibleMatch.candidato.productoId,
                                    )
                                  }
                                >
                                  Confirmar asociación
                                </Button>
                              </div>
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                                  No es este producto — buscar otro
                                </summary>
                                <div className="mt-2 flex flex-col gap-2">
                                  {fallbackManual}
                                </div>
                              </details>
                            </div>
                          );
                        }

                        if (nuevoSugerido) {
                          const categoriaEfectiva =
                            categoriaPorGrupo[rawNombre] ??
                            nuevoSugerido.categoriaSugerida.categoriaNombre;
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-2 p-2 bg-violet-50/60 border border-violet-200 rounded-md">
                                <div className="min-w-0">
                                  <p className="font-semibold text-violet-700 flex items-center gap-1.5 truncate">
                                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                    {categoriaEfectiva}
                                  </p>
                                  <p className="text-[11px] text-violet-700/70 mt-0.5">
                                    Sugerido por &quot;
                                    {nuevoSugerido.categoriaSugerida.matchedKeyword}&quot;
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                                  disabled={loadingPorGrupo[rawNombre]}
                                  onClick={() =>
                                    handleCrearSugerido(rawNombre, categoriaEfectiva)
                                  }
                                >
                                  {loadingPorGrupo[rawNombre] ? (
                                    "Creando..."
                                  ) : errorPorGrupo[rawNombre] ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />{" "}
                                      Reintentar
                                    </>
                                  ) : (
                                    "Crear"
                                  )}
                                </Button>
                              </div>
                              {errorPorGrupo[rawNombre] && (
                                <p className="text-[11px] text-rose-600 font-medium">
                                  {errorPorGrupo[rawNombre]}
                                </p>
                              )}
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                                  No es esta categoría — elegir a mano
                                </summary>
                                <div className="mt-2 flex flex-col gap-2">
                                  {fallbackManual}
                                </div>
                              </details>
                            </div>
                          );
                        }

                        if (isDesconocido) {
                          return (
                            <div className="flex flex-col gap-2 relative">
                              {fallbackManual}
                            </div>
                          );
                        }

                        return null;
                      })()}
                      {!isDesconocido && (
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
        onOpenChange={(open) => {
          if (!open) {
            setGroupToCreateName(null);
            setArchivosNuevoProducto([]);
            setCrearError(null);
          }
        }}
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

            <ProductMediaSection
              archivos={archivosNuevoProducto}
              onArchivosChange={setArchivosNuevoProducto}
              inputId="imagenes-merge-table"
            />

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
                    aplicar el precio calculado por variante, no un valor único.
                  </p>
                </div>
              )}
            </div>

            {crearError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-md p-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-900 font-medium leading-tight">
                  {crearError}
                </p>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setGroupToCreateName(null);
                  setArchivosNuevoProducto([]);
                  setCrearError(null);
                }}
                disabled={crearLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCrearAlVuelo}
                disabled={crearLoading}
                className="bg-primary"
              >
                {crearLoading ? (
                  "Creando..."
                ) : crearError ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
                  </>
                ) : (
                  "Guardar y Asignar Todo"
                )}
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

      {/* Modal de Recuperación de Borrador Local */}
      <AlertDialog open={draftState === "prompt"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Progreso sin confirmar encontrado</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos un progreso sin confirmar de esta conciliación.
              ¿Querés continuar donde quedaste?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDescartarDraft}>
              Empezar de cero
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRestaurarDraft}>
              Continuar donde quedé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
