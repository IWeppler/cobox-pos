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
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Save,
  Loader2,
  Store,
  Phone,
  MapPin,
  ReceiptText,
  Building2,
  Briefcase,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  ImagenNoProcesableError,
  optimizarImagen,
} from "@/shared/utils/image-optimizer";
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
      try {
        const compressed = await optimizarImagen(logoFile);
        formData.append("logo", compressed);
      } catch (error) {
        // optimizarImagen ya no devuelve el original cuando falla: cortamos
        // el guardado en vez de subir el archivo crudo.
        toast.error(
          error instanceof ImagenNoProcesableError
            ? error.message
            : "No se pudo procesar el logo. Probá con otra imagen.",
        );
        return;
      } finally {
        setIsCompressing(false);
      }
    }

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Datos de la Empresa
        </CardTitle>
        <CardDescription>
          Esta información se utilizará para la identidad visual, facturación y
          tickets del punto de venta.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={handleSubmit} className="space-y-8">
          <input type="hidden" name="id" value={config.id} />

          {/* === SECCIÓN 1: IDENTIDAD VISUAL === */}
          <div className="space-y-4">
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
                className="flex flex-col items-center justify-center h-20 px-6 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/20 hover:bg-primary/5 hover:border-primary transition-colors flex-1 sm:flex-none"
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

          {/* === SECCIÓN 2: DATOS FISCALES Y COMERCIALES === */}
          <div className="space-y-6 pt-6 border-t border-border/50">
            <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              Información Comercial
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="posName">
                  Nombre Comercial<span className="text-danger">*</span>
                </Label>
                <Input
                  id="posName"
                  name="posName"
                  defaultValue={config.posName}
                  placeholder="Ej: Kiosco Lo de Carlitos"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="razon_social">Razón Social</Label>
                <Input
                  id="razon_social"
                  name="razon_social"
                  
                  defaultValue={config.razon_social || ""}
                  placeholder="Ej: Carlos Pérez S.A."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  name="cuit"
                  
                  defaultValue={config.cuit || ""}
                  placeholder="Ej: 30-12345678-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="condicion_iva">Condición frente al IVA</Label>
                {/* Implementación de Shadcn Select que inyecta automáticamente el input hidden con el name para el formData */}
                <Select
                  name="condicion_iva"
                  
                  defaultValue={config.condicion_iva || undefined}
                >
                  <SelectTrigger
                    id="condicion_iva"
                    className="w-full bg-transparent"
                  >
                    <SelectValue placeholder="Seleccionar condición..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Responsable Inscripto">
                      Responsable Inscripto
                    </SelectItem>
                    <SelectItem value="Monotributo">Monotributo</SelectItem>
                    <SelectItem value="Exento">Exento</SelectItem>
                    <SelectItem value="Consumidor Final">
                      Consumidor Final
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="inicio_actividades"
                  className="flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Inicio de Actividades
                </Label>
                <Input
                  id="inicio_actividades"
                  name="inicio_actividades"
                  type="date"
                  
                  defaultValue={config.inicio_actividades || ""}
                />
              </div>
            </div>
          </div>

          {/* === SECCIÓN 3: UBICACIÓN === */}
          <div className="space-y-6 pt-6 border-t border-border/50">
            <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Ubicación Física
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-6">
              <div className="space-y-2 sm:col-span-6">
                <Label htmlFor="direccion">Dirección Fiscal / Local</Label>
                <Input
                  id="direccion"
                  name="direccion"
                  defaultValue={config.direccion || ""}
                  placeholder="Ej: Av. San Martín 456"
                />
              </div>

              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="provincia">Provincia</Label>
                <Input
                  id="provincia"
                  name="provincia"
                  
                  defaultValue={config.provincia || ""}
                  placeholder="Ej: Santa Fe"
                />
              </div>

              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="localidad">Localidad</Label>
                <Input
                  id="localidad"
                  name="localidad"
                  
                  defaultValue={config.localidad || ""}
                  placeholder="Ej: Rosario"
                />
              </div>
            </div>
          </div>

          {/* === SECCIÓN 4: CONTACTO Y OPERACIÓN === */}
          <div className="space-y-6 pt-6 border-t border-border/50">
            <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              Contacto y Operación
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">
                  Teléfono / WhatsApp<span className="text-danger">*</span>
                </Label>
                {/* El name TIENE que ser "whatsapp": es lo que lee la action y
                    el nombre de la columna. Con name="telefono" el campo no
                    llegaba nunca y el guardado fallaba siempre. */}
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  defaultValue={config.whatsapp || ""}
                  placeholder="Ej: 5491137920744"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  Incluye el código de país (549) sin el signo +
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label
                htmlFor="mensaje_ticket"
                className="flex items-center gap-2"
              >
                <ReceiptText className="w-4 h-4 text-muted-foreground" />
                Mensaje personalizado en el Ticket
              </Label>
              {/* Implementación de Shadcn Textarea */}
              <Textarea
                id="mensaje_ticket"
                name="mensaje_ticket"
                rows={3}
                defaultValue={config.mensaje_ticket || ""}
                placeholder="¡Gracias por elegirnos! Vuelva pronto."
                className="resize-y"
              />
            </div>
          </div>

          {/* === BOTÓN DE GUARDADO === */}
          <div className="flex justify-end pt-6 border-t border-border">
            <Button
              type="submit"
              disabled={isPending || isCompressing}
              className="w-full sm:w-auto min-w-37"
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
