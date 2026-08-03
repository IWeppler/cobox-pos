"use client";

import {
  useState,
  type FormEventHandler,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { DatePickerAR } from "@/shared/components/date-picker-ar";
import { Loader2, UserPlus, Search, Building2 } from "lucide-react";
import { toast } from "sonner";

interface CreateClientDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  action?: FormHTMLAttributes<HTMLFormElement>["action"];
  onSubmit?: FormEventHandler<HTMLFormElement>;
  isPending?: boolean;
  /** Vencimiento de deuda: solo tiene sentido en la ficha de clientes, no en el POS. */
  includeVencimientoDeuda?: boolean;
  showExceptuadoEntregaMinima?: boolean;
}

export function CreateClientDialog({
  open,
  onOpenChange,
  trigger,
  action,
  onSubmit,
  isPending = false,
  includeVencimientoDeuda = false,
  showExceptuadoEntregaMinima = false,
}: Readonly<CreateClientDialogProps>) {
  // Estado para la revelación progresiva de los datos fiscales
  const [isFiscal, setIsFiscal] = useState(false);
  const [isSearchingAfip, setIsSearchingAfip] = useState(false);

  // Función simulada para el futuro autocompletado con AFIP
  const handleBuscarAFIP = () => {
    setIsSearchingAfip(true);
    // Aquí irá tu lógica de fetch a tu backend que consulta afip.js
    setTimeout(() => {
      setIsSearchingAfip(false);
      toast.info("Próximamente: Autocompletado con ARCA");
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent className="sm:max-w-2xl border-border bg-card max-h-[90vh] overflow-y-auto p-0">
        <div className="p-6 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="w-5 h-5 text-primary" />
              Nuevo Cliente
            </DialogTitle>
          </DialogHeader>
        </div>

        <form
          action={action}
          onSubmit={onSubmit}
          className="px-6 pb-6 space-y-5"
        >
          {/* ==========================================
              DATOS COMERCIALES (Siempre visibles)
          ========================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-sm font-medium">
                Nombre<span className="text-danger">*</span>
              </Label>
              <Input
                id="nombre"
                name="nombre"
                placeholder="Ej: Juan Perez / Kiosco Sol"
                required
                className="h-10 shadow-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp" className="text-sm font-medium">
                Teléfono / WhatsApp <span className="text-danger">*</span>
              </Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                placeholder="Ej: 3491 123456"
                required
                className="h-10 shadow-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Correo Electrónico (Opcional)
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Ej: cliente@email.com"
                className="h-10 shadow-none"
              />
            </div>

            {/* Siempre visible: es el dato que pide la factura B a consumidor
                final, y en el POS también hace falta. */}
            <div className="space-y-2">
              <Label htmlFor="dni" className="text-sm font-medium">
                DNI (Opcional)
              </Label>
              <Input
                id="dni"
                name="dni"
                inputMode="numeric"
                placeholder="Ej: 30123456"
                className="h-10 shadow-none"
              />
            </div>
          </div>

          {/* ==========================================
              TOGGLE FISCAL
          ========================================== */}
          <div
            className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${isFiscal ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}
          >
            <div className="space-y-0.5">
              <Label
                htmlFor="is_fiscal"
                className="text-sm font-bold flex items-center gap-2 cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-primary" />
                Cliente Fiscal (Factura A / B)
              </Label>
              <p className="text-xs text-muted-foreground">
                Habilitá esta opción para cargar CUIT y datos de facturación.
              </p>
            </div>
            <Switch
              id="is_fiscal"
              checked={isFiscal}
              onCheckedChange={setIsFiscal}
            />
            {/* Input oculto para que el formData sepa si es fiscal o no */}
            <input
              type="hidden"
              name="es_fiscal"
              value={isFiscal ? "true" : "false"}
            />
          </div>

          {/* ==========================================
              DATOS FISCALES (Revelación Progresiva)
          ========================================== */}
          {isFiscal && (
            <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Búsqueda CUIT */}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cuit" className="text-sm font-medium">
                    CUIT <span className="text-danger">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="cuit"
                      name="cuit"
                      placeholder="Ej: 30712345678"
                      required={isFiscal}
                      className="h-10 shadow-none font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleBuscarAFIP}
                      disabled={isSearchingAfip}
                      className="shrink-0"
                    >
                      {isSearchingAfip ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 mr-2" />
                      )}
                      {isSearchingAfip ? "" : "Buscar en ARCA"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Ingresá el CUIT sin guiones para autocompletar los datos.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="razon_social" className="text-sm font-medium">
                    Razón Social <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="razon_social"
                    name="razon_social"
                    required={isFiscal}
                    className="h-10 shadow-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="condicion_iva"
                    className="text-sm font-medium"
                  >
                    Condición de IVA <span className="text-danger">*</span>
                  </Label>
                  <Select name="condicion_iva" required={isFiscal}>
                    <SelectTrigger className="h-10 shadow-none bg-background">
                      <SelectValue placeholder="Seleccionar..." />
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
              </div>

              {/* Domicilio Fiscal */}
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 pt-2">
                <div className="space-y-2 sm:col-span-6">
                  <Label htmlFor="direccion" className="text-sm font-medium">
                    Domicilio Fiscal
                  </Label>
                  <Input
                    id="direccion"
                    name="direccion"
                    placeholder="Ej: Av. San Martín 123"
                    className="h-10 shadow-none"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="localidad" className="text-sm font-medium">
                    Localidad
                  </Label>
                  <Input
                    id="localidad"
                    name="localidad"
                    className="h-10 shadow-none"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="provincia" className="text-sm font-medium">
                    Provincia
                  </Label>
                  <Input
                    id="provincia"
                    name="provincia"
                    className="h-10 shadow-none"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label
                    htmlFor="codigo_postal"
                    className="text-sm font-medium"
                  >
                    C.P.
                  </Label>
                  <Input
                    id="codigo_postal"
                    name="codigo_postal"
                    className="h-10 shadow-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              DATOS OPERATIVOS Y OPCIONALES
          ========================================== */}
          <div className="pt-2 space-y-4">
            {includeVencimientoDeuda && (
              <div className="space-y-2">
                <Label
                  htmlFor="fecha_vencimiento_deuda"
                  className="text-sm font-medium"
                >
                  Fecha de vencimiento de deuda (Opcional)
                </Label>
                <DatePickerAR
                  id="fecha_vencimiento_deuda"
                  name="fecha_vencimiento_deuda"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notas" className="text-sm font-medium">
                Notas (Opcional)
              </Label>
              <Input
                id="notas"
                name="notas"
                placeholder="Ej: Solo entregar mercadería por la mañana"
                className="h-10 shadow-none"
              />
            </div>

            {showExceptuadoEntregaMinima && (
              <div className="flex items-start gap-2 pt-2">
                <input
                  type="checkbox"
                  id="exceptuado_entrega_minima"
                  name="exceptuado_entrega_minima"
                  className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                />
                <Label
                  htmlFor="exceptuado_entrega_minima"
                  className="text-sm font-normal text-muted-foreground cursor-pointer"
                >
                  Exceptuado de entrega mínima en cuenta corriente
                </Label>
              </div>
            )}
          </div>

          {/* ==========================================
              ACTIONS
          ========================================== */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Cliente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
