"use client";

import { useState, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { toast } from "sonner";
import {
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  FolderTree,
  Loader2,
  Indent,
  Outdent,
  CornerDownRight,
} from "lucide-react";
import { bulkSaveCategoriasAction } from "../actions/manage-categories";

export interface Categoria {
  id: string;
  nombre: string;
  slug?: string;
  descripcion?: string | null;
  activa: boolean;
  orden: number;
  parent_id?: string | null;
}

// 2. Extendemos para manejar el estado local temporal
type LocalCategory = Categoria & {
  isNew?: boolean;
  tempId?: string;
  isDeleted?: boolean;
};

const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export function CategoriesPanel({
  categorias,
}: Readonly<{ categorias: Categoria[] }>) {
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Estado local para manejar la UI de forma optimista
  const [cats, setCats] = useState<LocalCategory[]>(() => [
    ...categorias,
    {
      id: "",
      nombre: "",
      activa: true,
      isNew: true,
      tempId: "new-initial",
      orden: categorias.length,
    },
  ]);

  const tempIdCounterRef = useRef(0);

  const createTempId = () => {
    tempIdCounterRef.current += 1;
    return `new-${tempIdCounterRef.current}`;
  };

  const handleNameChange = (index: number, newName: string) => {
    const newCats = [...cats];
    newCats[index].nombre = newName;

    if (index === newCats.length - 1 && newName.trim() !== "") {
      newCats.push({
        id: generateId(),
        nombre: "",
        activa: true,
        isNew: true,
        orden: newCats.length,
        parent_id: newCats[index].parent_id,
      });
    }

    setCats(newCats);
    setHasChanges(true);
  };

  const handleIndent = (index: number) => {
    if (index === 0) return; // La primera no puede ser subcategoría

    const newCats = [...cats];
    const prev = newCats[index - 1];

    // Su padre será el ítem anterior (o el padre del ítem anterior si este ya era subcategoría)
    const newParentId = prev.parent_id ? prev.parent_id : prev.id;
    newCats[index].parent_id = newParentId;

    setCats(newCats);
    setHasChanges(true);
  };

  const handleOutdent = (index: number) => {
    const newCats = [...cats];
    newCats[index].parent_id = null; // Vuelve a ser categoría principal
    setCats(newCats);
    setHasChanges(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index + 1 < inputRefs.current.length) {
        inputRefs.current[index + 1]?.focus();
      }
    }

    if (e.key === "Tab") {
      const isSub = !!cats[index].parent_id;
      if (e.shiftKey && isSub) {
        e.preventDefault();
        handleOutdent(index);
      } else if (!e.shiftKey && !isSub && index > 0) {
        e.preventDefault();
        handleIndent(index);
      }
    }
  };

  const toggleVisibility = (index: number) => {
    const newCats = [...cats];
    newCats[index].activa = !newCats[index].activa;
    setCats(newCats);
    setHasChanges(true);
  };

  const handleDelete = (index: number) => {
    const catToRemove = cats[index];
    if (!catToRemove.isNew && catToRemove.id) {
      setDeletedIds([...deletedIds, catToRemove.id]);
    }
    const newCats = cats.filter((_, i) => i !== index);

    // Siempre debe quedar al menos una fila vacía al final
    if (
      newCats.length === 0 ||
      newCats[newCats.length - 1].nombre.trim() !== ""
    ) {
      newCats.push({
        id: "",
        nombre: "",
        activa: true,
        isNew: true,
        tempId: createTempId(),
        orden: newCats.length,
      });
    }

    setCats(newCats);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);

    // Filtramos para enviar solo las que tienen nombre y no están marcadas para eliminar
    const toUpsert = cats.filter((c) => c.nombre.trim() !== "");

    const res = await bulkSaveCategoriasAction(toUpsert, deletedIds);

    setIsSaving(false);

    if (res.success) {
      toast.success("Categorías actualizadas correctamente.");
      setHasChanges(false);
      setDeletedIds([]);
    } else {
      toast.error(res.error || "Ocurrió un error al guardar.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderTree className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Categorías</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Para organizar tus productos, creá categorías que aparecerán en el
            menú de tu tienda y POS.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar Cambios
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex flex-col divide-y divide-border/60">
          {cats.map((cat, idx) => {
            const isLastEmptyRow = idx === cats.length - 1 && cat.nombre === "";
            const isSubcategoria = !!cat.parent_id;

            return (
              <div
                key={cat.id}
                className={`flex items-center gap-3 p-3 transition-colors ${isLastEmptyRow ? "bg-muted/10" : "hover:bg-muted/30"}`}
              >
                {/* Drag Handle  */}
                <div
                  className={`flex items-center ${isSubcategoria ? "ml-8" : ""}`}
                >
                  <div className="cursor-grab text-muted-foreground/30 hover:text-muted-foreground px-1">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  {isSubcategoria && (
                    <CornerDownRight className="w-4 h-4 text-muted-foreground/50 mr-2" />
                  )}
                </div>

                {/* Input Dinámico */}
                <div className="flex-1 relative">
                  <Input
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    value={cat.nombre}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    placeholder={
                      isLastEmptyRow && isSubcategoria
                        ? "+ Agregar subcategoría..."
                        : isLastEmptyRow
                          ? "+ Agregar categoría..."
                          : "Nombre de la categoría"
                    }
                    className={`h-11 shadow-none font-medium transition-all ${
                      isLastEmptyRow
                        ? "border-dashed border-border bg-transparent hover:border-primary/50 focus:border-solid focus:bg-background"
                        : "border-border/50 bg-background focus:ring-2 focus:ring-[#0051ff]/20 focus:border-[#0051ff]"
                    } ${!cat.activa ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"}`}
                  />
                </div>

                {/* Acciones de Fila */}
                {!isLastEmptyRow && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Botones de Indentar/Desindentar (Soporte visual además del teclado) */}
                    {!isSubcategoria &&
                      idx > 0 &&
                      !cats[idx - 1].nombre.trim().length === false && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleIndent(idx)}
                          className="h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 hidden sm:flex"
                          title="Convertir en subcategoría (Tab)"
                        >
                          <Indent className="w-4 h-4" />
                        </Button>
                      )}
                    {isSubcategoria && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOutdent(idx)}
                        className="h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 hidden sm:flex"
                        title="Convertir en categoría principal (Shift + Tab)"
                      >
                        <Outdent className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleVisibility(idx)}
                      className={`h-9 w-9 rounded-md transition-colors ${!cat.activa ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                      title={
                        cat.activa ? "Ocultar en tienda" : "Mostrar en tienda"
                      }
                    >
                      {cat.activa ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(idx)}
                      className="h-9 w-9 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
