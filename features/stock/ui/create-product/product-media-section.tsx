import { useRef } from "react";
import { ChevronRight, ImagePlus } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ProductMediaSectionProps = {
  archivos: File[];
  onArchivosChange: (archivos: File[]) => void;
  existingImages?: string[];
  inputId?: string;
};

export function ProductMediaSection({
  archivos,
  onArchivosChange,
  existingImages = [],
  inputId = "imagenes",
}: ProductMediaSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickImages = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onArchivosChange(Array.from(event.target.files));
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-foreground">Media</Label>
      <button
        type="button"
        onClick={handlePickImages}
        className="flex w-full items-center justify-between p-4 text-left rounded-xl cursor-pointer hover:bg-muted/50 transition-colors border border-dashed border-border/80 group"
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
              Añadir imágenes para este producto
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
            </div>
          ))}
          {archivos.map((file) => (
            <div
              key={file.name}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt="Preview"
                className="object-cover w-full h-full"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
