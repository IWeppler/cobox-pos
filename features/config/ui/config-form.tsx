"use client";

import { useState, useActionState, startTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateConfiguracionAction } from "../actions/config-actions";
import { ConfiguracionPOS } from "@/entities/config/types";
import { CATALOG_QUERY_KEYS } from "@/shared/lib/query-keys";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Save, Loader2, Store, Phone, MapPin, ReceiptText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { optimizarImagen } from "@/shared/utils/image-optimizer";
import { useRouter } from "next/navigation";

export function ConfigForm({ config }: Readonly<{ config: ConfiguracionPOS }>) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setLogoFile(e.target.files[0]);
    }
  };

  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
     
      const result = await updateConfiguracionAction(prevState, formData);
      if (result.success) {
        toast.success("Configuración actualizada correctamente.");
        setLogoFile(null);

        CATALOG_QUERY_KEYS.forEach((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        );
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    },
    { error: null, success: false },
  );

  const handleSubmit = async (formData: FormData) => {
    if (logoFile) {
      setIsCompressing(true);
      formData.delete("logo");
      const compressed = await optimizarImagen(logoFile);
      formData.append("logo", compressed);
      setIsCompressing(false);
    }

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          Datos del Comercio
        </CardTitle>
        <CardDescription>
          Esta información e identidad visual se utilizará en toda la
          plataforma.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={handleSubmit} className="space-y-6">
          <input type="hidden" name="id" value={config.id} />

          {/* Subida de Logo */}
          <div className="space-y-3 pb-4 border-b border-border/50">
            <Label>Logo del Comercio</Label>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                {logoFile ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(logoFile)}
                    alt="Preview Logo"
                    className="object-cover w-full h-full"
                  />
                ) : config.posLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.posLogo}
                    alt="Logo Actual"
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <Store className="w-8 h-8 text-muted-foreground/30" />
                )}
              </div>

              <Label
                htmlFor="logo"
                className="flex flex-col items-center justify-center h-20 px-6 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/20 hover:bg-primary/20 hover:border-primary transition-colors flex-1 sm:flex-none"
              >
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="font-semibold text-primary text-sm">
                    Cambiar Logo
                  </span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    PNG, JPG, WEBP
                  </span>
                </div>
                <Input
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="posName" className="flex items-center gap-2">
                Nombre del Negocio
              </Label>
              <Input
                id="posName"
                name="posName"
                defaultValue={config.posName}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Número de WhatsApp
              </Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={config.whatsapp}
                placeholder="Ej: 5491137920744"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Incluye el código de país (549) sin el signo +
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="direccion" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Dirección Física
            </Label>
            <Input
              id="direccion"
              name="direccion"
              defaultValue={config.direccion}
              placeholder="Ej: Av. San Martín 456, Santa Fe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mensaje_ticket" className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-muted-foreground" />
              Mensaje en el Ticket
            </Label>
            <textarea
              id="mensaje_ticket"
              name="mensaje_ticket"
              rows={3}
              defaultValue={config.mensaje_ticket}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder="¡Gracias por elegirnos!"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button
              type="submit"
              disabled={isPending || isCompressing}
              className="w-full sm:w-auto"
            >
              {isPending || isCompressing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
