"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfiguracionPOS } from "@/entities/config/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  Users,
  Loader2,
  Wallet,
  TrendingUp,
  ShieldAlert,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/config/supabase/client";

interface ClientsPanelProps {
  config: ConfiguracionPOS;
}

export function ClientsPanel({ config }: Readonly<ClientsPanelProps>) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    cc_activas: config.cc_activas ?? true,
    cc_recargo_default: config.cc_recargo_default ?? 0,
    cc_anticipo_default: config.cc_anticipo_default ?? 0,
    cc_limite_default: config.cc_limite_default ?? 0,
  });

  const handleChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
      toast.error("Error al guardar la configuración de clientes.");
      console.error(error);
    } else {
      toast.success("Reglas de Cuentas Corrientes actualizadas.");
      router.refresh();
    }
  };

  return (
    <>
      {/* HEADER */}
      <div className="space-y-6 animate-in fade-in-50 duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">
                Clientes y Cuentas Corrientes
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Establece las reglas generales de crédito y financiación para tu
              negocio.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* COLUMNA IZQ: Habilitación y Limites */}
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-5 space-y-6">
                <h3 className="font-bold text-foreground flex items-center gap-2 border-b border-border/50 pb-3">
                  <Wallet className="w-4 h-4 text-muted-foreground" />{" "}
                  Habilitación de Crédito
                </h3>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">
                      Cuentas Corrientes Activas
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Permite a los cajeros registrar ventas a crédito (fiado).
                    </p>
                  </div>
                  <Switch
                    checked={formData.cc_activas}
                    onCheckedChange={(v) => handleChange("cc_activas", v)}
                  />
                </div>

                <div
                  className={`space-y-3 transition-opacity ${!formData.cc_activas ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> Límite de Crédito
                      Base
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Límite global sugerido. Déjalo en 0 si no deseas límite
                      estricto.
                    </p>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      $
                    </span>
                    <Input
                      type="number"
                      min="0"
                      value={
                        formData.cc_limite_default === 0
                          ? ""
                          : formData.cc_limite_default
                      }
                      onChange={(e) =>
                        handleChange(
                          "cc_limite_default",
                          Number(e.target.value),
                        )
                      }
                      placeholder="0 (Sin límite)"
                      className="pl-8 bg-muted/50 border-border"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMNA DER: Reglas Financieras */}
            <div className="space-y-6">
              <div
                className={`bg-card border border-border rounded-2xl p-5 space-y-6 transition-opacity ${!formData.cc_activas ? "opacity-50 pointer-events-none" : ""}`}
              >
                <h3 className="font-bold text-foreground flex items-center gap-2 border-b border-border/50 pb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-600" /> Reglas
                  Financieras
                </h3>

                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-rose-500" /> Recargo
                      por Financiación (%)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se sumará este porcentaje al total de la venta cuando el
                      pago no sea al contado.
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={
                        formData.cc_recargo_default === 0
                          ? ""
                          : formData.cc_recargo_default
                      }
                      onChange={(e) =>
                        handleChange(
                          "cc_recargo_default",
                          Number(e.target.value),
                        )
                      }
                      placeholder="Ej: 15"
                      className="pr-8 bg-muted/50 border-border"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      %
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-blue-500" /> Entrega
                      Mínima (%)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Obliga al cliente a pagar este porcentaje por adelantado
                      para habilitar la deuda.
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={
                        formData.cc_anticipo_default === 0
                          ? ""
                          : formData.cc_anticipo_default
                      }
                      onChange={(e) =>
                        handleChange(
                          "cc_anticipo_default",
                          Number(e.target.value),
                        )
                      }
                      placeholder="Ej: 50"
                      className="pr-8 bg-muted/50 border-border"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
