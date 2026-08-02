"use client";

import { ArrowLeft, MapPin, Store } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { ModalidadEntregaPublica } from "@/shared/components/cart-sidebar/cart-sidebar-utils";

export interface EnvioInfo {
  tipo: "LOCAL" | "LEJOS";
  costo?: number;
  mensaje?: string;
}

interface CartCheckoutPublicoProps {
  nombre: string;
  onNombreChange: (value: string) => void;
  modalidad: ModalidadEntregaPublica;
  onModalidadChange: (value: ModalidadEntregaPublica) => void;
  localidad: string;
  onLocalidadChange: (value: string) => void;
  direccion: string;
  onDireccionChange: (value: string) => void;
  envioInfo: EnvioInfo | null;
  nota: string;
  onNotaChange: (value: string) => void;
  onBackToCart: () => void;
  children?: React.ReactNode;
}

export function CartCheckoutPublico({
  nombre,
  onNombreChange,
  modalidad,
  onModalidadChange,
  localidad,
  onLocalidadChange,
  direccion,
  onDireccionChange,
  envioInfo,
  nota,
  onNotaChange,
  onBackToCart,
  children,
}: Readonly<CartCheckoutPublicoProps>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <Button
          type="button"
          variant="ghost"
          onClick={onBackToCart}
          className="mb-3 h-9 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Volver
        </Button>

        <div className="space-y-4">
          {/* NOMBRE */}
          <section className="space-y-3 rounded-lg border border-border bg-muted p-4">
            <Label htmlFor="nombre_cliente_publico">
              Nombre <span className="text-danger">*</span>
            </Label>
            <Input
              id="nombre_cliente_publico"
              value={nombre}
              onChange={(e) => onNombreChange(e.target.value)}
              placeholder="Tu nombre"
              className="h-11 rounded-lg bg-card"
            />
          </section>

          {/* MODALIDAD DE ENTREGA */}
          <section className="space-y-3 rounded-lg border border-border bg-muted p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Modalidad de Entrega
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={modalidad === "RETIRO" ? "default" : "outline"}
                onClick={() => onModalidadChange("RETIRO")}
                className="h-11"
              >
                <Store className="mr-1.5 h-4 w-4" />
                Retiro en local
              </Button>
              <Button
                type="button"
                variant={modalidad === "ENVIO" ? "default" : "outline"}
                onClick={() => onModalidadChange("ENVIO")}
                className="h-11"
              >
                <MapPin className="mr-1.5 h-4 w-4" />
                Envío a domicilio
              </Button>
            </div>

            {modalidad === "ENVIO" && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <Label htmlFor="localidad_publica">
                    Localidad <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="localidad_publica"
                    value={localidad}
                    onChange={(e) => onLocalidadChange(e.target.value)}
                    placeholder="Ej: Tostado"
                    className="h-11 rounded-lg bg-card"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direccion_publica">
                    Dirección <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="direccion_publica"
                    value={direccion}
                    onChange={(e) => onDireccionChange(e.target.value)}
                    placeholder="Calle y número"
                    className="h-11 rounded-lg bg-card"
                  />
                </div>

                {envioInfo?.tipo === "LOCAL" && (
                  <div className="rounded-md border border-success/20 bg-success/10 p-2.5 text-xs font-medium text-success">
                    Costo de envío: $
                    {(envioInfo.costo || 0).toLocaleString("es-AR")}
                  </div>
                )}
                {envioInfo?.tipo === "LEJOS" && (
                  <div className="rounded-md border border-warning/20 bg-warning/10 p-2.5 text-xs font-medium text-warning">
                    {envioInfo.mensaje}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* NOTA */}
          <section className="space-y-3 rounded-lg border border-border bg-muted p-4">
            <Label htmlFor="nota_publica">Nota (opcional)</Label>
            <Textarea
              id="nota_publica"
              value={nota}
              onChange={(e) => onNotaChange(e.target.value)}
              placeholder="Algo que quieras aclarar sobre tu pedido..."
              className="bg-card"
              rows={3}
            />
          </section>
        </div>
      </div>
      {children}
    </div>
  );
}
