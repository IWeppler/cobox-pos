"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ImagePlus, X } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
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

type ProductMediaSectionProps = {
  archivos: File[];
  onArchivosChange: (archivos: File[]) => void;
  existingImages?: string[];
  /**
   * Si no se pasa, las imágenes existentes se muestran sin botón de quitar:
   * removerlas implica borrar algo ya guardado en Storage/la base, y eso
   * solo tiene sentido cuando quien usa el componente sabe cómo persistir
   * esa baja (hoy ningún flujo lo hace).
   */
  onRemoveExistingImage?: (url: string) => void;
  inputId?: string;
};

export function ProductMediaSection({
  archivos,
  onArchivosChange,
  existingImages = [],
  onRemoveExistingImage,
  inputId = "imagenes",
}: ProductMediaSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [imagenExistenteAQuitar, setImagenExistenteAQuitar] = useState<
    string | null
  >(null);

  const handlePickImages = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onArchivosChange([...archivos, ...Array.from(event.target.files)]);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);

    const soltados = Array.from(event.dataTransfer.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (soltados.length > 0) onArchivosChange([...archivos, ...soltados]);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  };

  // Captura Ctrl+V mientras este componente está montado (o sea, mientras
  // el modal/form que lo contiene está abierto).
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const pegadas: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) pegadas.push(file);
        }
      }
      if (pegadas.length > 0) onArchivosChange([...archivos, ...pegadas]);
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [archivos, onArchivosChange]);

  const handleRemoveArchivo = (file: File) => {
    onArchivosChange(archivos.filter((f) => f !== file));
  };

  const confirmarRemoverExistente = () => {
    if (imagenExistenteAQuitar && onRemoveExistingImage) {
      onRemoveExistingImage(imagenExistenteAQuitar);
    }
    setImagenExistenteAQuitar(null);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-foreground">Media</Label>
      <button
        type="button"
        onClick={handlePickImages}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex w-full items-center justify-between p-4 text-left rounded-xl cursor-pointer hover:bg-muted/50 transition-colors border border-dashed group ${
          isDraggingOver
            ? "border-primary bg-primary/5"
            : "border-border/80"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-muted/50 rounded-lg flex items-center justify-center group-hover:bg-muted transition-colors">
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">
              Agregar media
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click, arrastrá una imagen o pegala con Ctrl+V
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>
      <Input
        ref={fileInputRef}
        id={inputId}
        name="imagenes"
        type="file"
        multiple
        accept="image/png, image/jpeg, image/webp, image/heic"
        className="hidden"
        onChange={handleFilesChange}
      />

      {(existingImages.length > 0 || archivos.length > 0) && (
        <div className="flex flex-wrap gap-3 mt-4">
          {existingImages.map((image) => (
            <div
              key={image}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Producto"
                className="object-cover w-full h-full"
              />
              {onRemoveExistingImage && (
                <button
                  type="button"
                  onClick={() => setImagenExistenteAQuitar(image)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                  title="Quitar imagen"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {archivos.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt="Preview"
                className="object-cover w-full h-full"
              />
              <button
                type="button"
                onClick={() => handleRemoveArchivo(file)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                title="Quitar de la selección"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={imagenExistenteAQuitar !== null}
        onOpenChange={(open) => !open && setImagenExistenteAQuitar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar esta imagen del producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta imagen ya está guardada en el producto. Se va a quitar de
              la galería al guardar los cambios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setImagenExistenteAQuitar(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarRemoverExistente}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              Quitar imagen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
