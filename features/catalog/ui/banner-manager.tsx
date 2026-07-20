"use client";

import { useState } from "react";
import { ConfiguracionPOS } from "@/entities/config/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  ImagePlus,
  Save,
  Loader2,
  Megaphone,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/config/supabase/client";

interface BannerManagerProps {
  config: ConfiguracionPOS;
}

export function BannerManager({ config }: Readonly<BannerManagerProps>) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    banner_activo: config.banner_activo ?? false,
    banner_imagen: config.banner_imagen || "",
    banner_titulo: config.banner_titulo || "",
    banner_subtitulo: config.banner_subtitulo || "",
    banner_boton_texto: config.banner_boton_texto || "",
    banner_link: config.banner_link || "",
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const supabase = createClient();

      // Subimos al bucket 'productos' (aprovechamos el que ya existe) en una carpeta 'banners'
      const fileExt = file.name.split(".").pop();
      const fileName = `banners/${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("productos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("productos").getPublicUrl(fileName);

      handleChange("banner_imagen", publicUrl);
      toast.success("Imagen subida correctamente");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Ocurrió un error al subir la imagen");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("configuracion_pos")
      .update(formData)
      .eq("id", config.id);

    setIsSaving(false);

    if (error) {
      toast.error("Error al guardar la configuración del banner.");
    } else {
      toast.success("Banner actualizado correctamente.");
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Banner Promocional
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Destaca una colección, promoción o producto estrella en la parte
            superior de tu tienda.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 mr-2">
            <Label
              className="text-sm font-bold cursor-pointer"
              htmlFor="banner-toggle"
            >
              Activar
            </Label>
            <Switch
              id="banner-toggle"
              checked={formData.banner_activo}
              onCheckedChange={(v) => handleChange("banner_activo", v)}
            />
          </div>
          <Button onClick={handleSave} disabled={isSaving || isUploading}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-opacity ${!formData.banner_activo ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* Lado Izquierdo: Imagen */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">
            Imagen de Fondo (Recomendado: 1200x400px)
          </Label>

          {formData.banner_imagen ? (
            <div className="relative w-full aspect-21/9 sm:aspect-3/1 rounded-xl overflow-hidden border border-border group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={formData.banner_imagen}
                alt="Banner Preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleChange("banner_imagen", "")}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar imagen
                </Button>
              </div>
            </div>
          ) : (
            <Label
              htmlFor="banner-upload"
              className="flex flex-col items-center justify-center w-full aspect-21/9 sm:aspect-3/1 border-2 border-dashed border-border rounded-xl cursor-pointer bg-muted/20 hover:bg-primary/10 hover:border-primary/50 transition-colors"
            >
              <div className="flex flex-col items-center justify-center text-center px-4">
                {isUploading ? (
                  <Loader2 className="w-8 h-8 mb-3 text-primary animate-spin" />
                ) : (
                  <ImagePlus className="w-8 h-8 mb-3 text-muted-foreground" />
                )}
                <p className="mb-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-primary">
                    Haz clic para subir
                  </span>{" "}
                  o arrastra
                </p>
              </div>
              <Input
                id="banner-upload"
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
                onChange={handleImageUpload}
                disabled={isUploading}
              />
            </Label>
          )}
        </div>

        {/* Lado Derecho: Textos */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
              Título Principal
            </Label>
            <Input
              value={formData.banner_titulo}
              onChange={(e) => handleChange("banner_titulo", e.target.value)}
              placeholder="Ej: Colección Primavera"
              className="font-bold text-lg h-12"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
              Subtítulo / Bajada
            </Label>
            <Input
              value={formData.banner_subtitulo}
              onChange={(e) => handleChange("banner_subtitulo", e.target.value)}
              placeholder="Ej: 15% OFF en todos los productos de interior"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
                Texto del Botón
              </Label>
              <Input
                value={formData.banner_boton_texto}
                onChange={(e) =>
                  handleChange("banner_boton_texto", e.target.value)
                }
                placeholder="Ej: Ver productos"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5" /> Link de destino
              </Label>
              <Input
                value={formData.banner_link}
                onChange={(e) => handleChange("banner_link", e.target.value)}
                placeholder="Ej: /store?categoria=interior"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
