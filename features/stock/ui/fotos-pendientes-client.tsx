"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { queryKeys } from "@/shared/lib/query-keys";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import {
  ImagenError,
  optimizarImagenesProducto,
} from "@/shared/utils/image-optimizer";
import { subirImagenesProductoDesdeCliente } from "../lib/subir-imagenes-cliente";
import { actualizarFotosProductoAction } from "../actions/actualizar-fotos-producto";
import type { ProductoSinFoto } from "../actions/get-productos-sin-foto";

/**
 * Fotos pendientes: la contracara de haber sacado la foto del camino crítico.
 *
 * Cargar mercadería no puede depender de tener las fotos sacadas —con 94
 * productos en un remito, pedir una foto por producto es no cargar el remito—,
 * pero un producto sin foto que nadie recuerda es un producto que se queda sin
 * foto para siempre. Acá se cargan por tanda, cuando hay tiempo.
 *
 * Cada producto es su propia operación: la foto se sube y se guarda en el
 * acto, sin un botón "Guardar" al final. Si se corta la luz en el producto 12,
 * los 11 anteriores ya están.
 */
export function FotosPendientesClient({
  productosIniciales,
  total,
}: Readonly<{ productosIniciales: ProductoSinFoto[]; total: number }>) {
  const negocioId = useNegocioActivo()?.id ?? null;
  const queryClient = useQueryClient();

  const [pendientes, setPendientes] = useState(productosIniciales);
  const [listos, setListos] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function subirFotos(producto: ProductoSinFoto, archivos: File[]) {
    if (archivos.length === 0 || subiendo) return;

    if (!negocioId) {
      toast.error("Todavía no se resolvió el comercio activo. Probá de nuevo.");
      return;
    }

    setSubiendo(producto.id);
    try {
      const optimizadas = await optimizarImagenesProducto(archivos);
      const urls = await subirImagenesProductoDesdeCliente(
        negocioId,
        optimizadas,
        archivos.length,
      );

      if (urls.mains.length === 0) {
        toast.error("No se pudo subir la foto. Probá de nuevo.");
        return;
      }

      const res = await actualizarFotosProductoAction(producto.id, {
        agregar: urls,
      });
      if (!res.success) {
        toast.error(res.error ?? "No se pudo guardar la foto.");
        return;
      }

      setListos((prev) => new Set(prev).add(producto.id));
      queryClient.invalidateQueries({ queryKey: queryKeys.catalogo });
    } catch (error) {
      toast.error(
        error instanceof ImagenError
          ? error.message
          : "No se pudo procesar la foto. Probá con una a la vez.",
      );
    } finally {
      setSubiendo(null);
    }
  }

  const restantes = pendientes.filter((p) => !listos.has(p.id)).length;

  if (pendientes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No tenés productos sin foto. Están todos con imagen.
        </p>
        <Link
          href="/stock"
          className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-2"
        >
          Volver a Inventario
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-2 md:p-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Link
          href="/stock"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-sm font-medium text-foreground">
            Fotos pendientes
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {restantes} de {total} producto{total === 1 ? "" : "s"} sin foto.
            Cada foto se guarda sola, podés cortar cuando quieras.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pendientes.map((producto) => {
          const listo = listos.has(producto.id);
          const enCurso = subiendo === producto.id;

          return (
            <div
              key={producto.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                listo
                  ? "border-success/40 bg-success/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {producto.nombre}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[producto.marca, producto.tipo]
                    .filter(Boolean)
                    .join(" · ") || "Sin categoría"}
                </p>
              </div>

              <input
                ref={(el) => {
                  inputs.current[producto.id] = el;
                }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const archivos = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void subirFotos(producto, archivos);
                }}
              />

              <Button
                type="button"
                size="sm"
                variant={listo ? "ghost" : "secondary"}
                disabled={enCurso || listo}
                onClick={() => inputs.current[producto.id]?.click()}
                className="shrink-0"
              >
                {listo ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4 text-success" /> Lista
                  </>
                ) : enCurso ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{" "}
                    Subiendo…
                  </>
                ) : (
                  <>
                    <Camera className="mr-1.5 h-4 w-4" /> Sacar o elegir
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {listos.size > 0 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setPendientes((prev) => prev.filter((p) => !listos.has(p.id)));
            setListos(new Set());
          }}
        >
          Ocultar los {listos.size} ya resueltos
        </Button>
      )}
    </div>
  );
}
