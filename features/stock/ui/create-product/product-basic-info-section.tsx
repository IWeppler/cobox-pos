"use client";

import { useState } from "react";
import { Input } from "@/shared/ui/input";
import { AvisoProductoDuplicado } from "../aviso-producto-duplicado";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { MarcaCombobox } from "./marca-combobox";
import { etiquetaMarca } from "@/features/stock/lib/marca-por-rubro";
import { etiquetaSku } from "@/features/stock/lib/identidad-por-rubro";
import type { Rubro } from "@/entities/config/types";

type ProductBasicInfoSectionProps = {
  status: "active" | "inactive";
  onStatusChange: (status: "active" | "inactive") => void;
  defaultNombre?: string;
  defaultDescripcion?: string | null;
  mostrarMarca?: boolean;
  rubro?: Rubro;
  defaultMarca?: string | null;
  mostrarSku?: boolean;
  defaultSku?: string | null;
  /**
   * Con esto, el campo avisa si ya existe un producto así. Se pasa la
   * categoría porque un duplicado no es "mismo nombre" sino "mismo nombre,
   * misma categoría y misma marca" — sin ella, el aviso saltaría en las 31
   * coincidencias legítimas del SaaS y se aprendería a ignorarlo.
   */
  categoriaId?: string | null;
  /** Al editar: para no avisar que el producto choca consigo mismo. */
  productoId?: string;
};

export function ProductBasicInfoSection({
  status,
  onStatusChange,
  defaultNombre,
  defaultDescripcion,
  mostrarMarca = false,
  rubro,
  defaultMarca,
  mostrarSku = false,
  defaultSku,
  categoriaId,
  productoId,
}: ProductBasicInfoSectionProps) {
  // El input sigue siendo no controlado (lo lee el FormData del submit); esto
  // es solo para el aviso de duplicado, que necesita el texto mientras se
  // escribe. Cambiarlo a controlado tocaría el guardado de todos los formularios
  // que usan esta sección.
  const [nombre, setNombre] = useState(defaultNombre ?? "");
  const [marca, setMarca] = useState(defaultMarca ?? "");

  return (
    <>
      <div className="space-y-2">
        <Label
          htmlFor="nombre"
          className="text-sm font-semibold text-foreground"
        >
          Título del producto
        </Label>
        <Input
          id="nombre"
          name="nombre"
          placeholder="Ingresa el nombre del producto"
          defaultValue={defaultNombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className="h-11 px-3 bg-sidebar"
        />

        <AvisoProductoDuplicado
          nombre={nombre}
          categoriaId={categoriaId}
          marca={marca}
          productoId={productoId}
        />
      </div>

      {(mostrarMarca || mostrarSku) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mostrarSku && (
            <div className="space-y-2 order-first sm:order-last">
              <Label
                htmlFor="sku"
                className="text-sm font-semibold text-foreground"
              >
                {etiquetaSku(rubro)}
              </Label>
              <Input
                id="sku"
                name="sku"
                defaultValue={defaultSku ?? ""}
                placeholder="Ej: 123456"
                autoComplete="off"
                className="h-11 px-3 bg-sidebar"
              />
            </div>
          )}

          {mostrarMarca && (
            <MarcaCombobox
              etiqueta={`${rubro ? etiquetaMarca(rubro) : "Marca"}`}
              valorInicial={defaultMarca}
              onValorChange={setMarca}
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-foreground">Estado</Label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onStatusChange("active")}
            className={`flex-1 flex items-center gap-3 p-3 bg-transparent border rounded-lg transition-all shadow-none ${status === "active" ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-border/80"}`}
          >
            <div
              className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${status === "active" ? "border-primary" : "border-muted-foreground/40"}`}
            >
              {status === "active" && (
                <div className="w-2 h-2 bg-primary rounded-full" />
              )}
            </div>
            <span className="font-medium text-sm">Activo</span>
          </button>
          <button
            type="button"
            onClick={() => onStatusChange("inactive")}
            className={`flex-1 flex items-center gap-3 p-3 bg-transparent border rounded-lg transition-all shadow-none ${status === "inactive" ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-border/80"}`}
          >
            <div
              className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${status === "inactive" ? "border-primary" : "border-muted-foreground/40"}`}
            >
              {status === "inactive" && (
                <div className="w-2 h-2 bg-primary rounded-full" />
              )}
            </div>
            <span className="font-medium text-sm">Inactivo</span>
          </button>
        </div>
        <input
          type="hidden"
          name="publicado"
          value={status === "active" ? "true" : "false"}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="descripcion"
          className="text-sm font-semibold text-foreground"
        >
          Descripción
        </Label>
        <Textarea
          id="descripcion"
          name="descripcion"
          placeholder="Descripción del producto..."
          defaultValue={defaultDescripcion || ""}
          className="bg-sidebar rounded-lg shadow-none border-border resize-none h-28 p-3 text-sm"
        />
      </div>
    </>
  );
}
