"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  solicitarComercioAction,
  type SolicitudState,
} from "../actions/solicitar-comercio";
import { RUBROS } from "@/shared/lib/rubros";

const initialState: SolicitudState = { error: null, success: false };

export function SolicitudComercioForm({
  onVolver,
}: Readonly<{ onVolver: () => void }>) {
  const [state, formAction, isPending] = useActionState(
    solicitarComercioAction,
    initialState,
  );
  const [rubro, setRubro] = useState("");

  if (state.success) {
    return (
      <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            ¡Listo, lo recibimos!
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Te escribiremos por WhatsApp para terminar de configurar tu comercio.
          </p>
        </div>
        <Button variant="outline" className="w-full h-11" onClick={onVolver}>
          Volver al inicio de sesión
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" aria-busy={isPending}>
      <div className="space-y-2">
        <Label htmlFor="nombre_contacto">Nombre y apellido</Label>
        <Input
          id="nombre_contacto"
          name="nombre_contacto"
          required
          disabled={isPending}
          autoComplete="name"
          placeholder="María Gómez"
          className="h-11 shadow-none bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          required
          disabled={isPending}
          autoComplete="tel"
          placeholder="3492 123456"
          className="h-11 shadow-none bg-background"
        />
        <p className="text-xs text-muted-foreground">
          Es por donde te vamos a contactar.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre_comercio">Nombre del comercio</Label>
        <Input
          id="nombre_comercio"
          name="nombre_comercio"
          required
          disabled={isPending}
          placeholder="Almacén La Esquina"
          className="h-11 shadow-none bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rubro">Rubro</Label>
        <Select
          name="rubro"
          required
          disabled={isPending}
          value={rubro}
          onValueChange={setRubro}
        >
          <SelectTrigger id="rubro" className="h-11 bg-background">
            <SelectValue placeholder="Elegí un rubro" />
          </SelectTrigger>
          <SelectContent>
            {RUBROS.map((r) => (
              <SelectItem key={r.valor} value={r.valor}>
                {r.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sin esto, un "Otro" queda como un lead del que no sabemos el rubro. */}
      {rubro === "otro" && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Label htmlFor="rubro_otro">¿De qué rubro?</Label>
          <Input
            id="rubro_otro"
            name="rubro_otro"
            required
            disabled={isPending}
            placeholder="Pinturería, panadería…"
            className="h-11 shadow-none bg-background"
          />
        </div>
      )}

      {state.error && (
        <div
          role="alert"
          aria-live="polite"
          className="text-sm text-destructive font-medium"
        >
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full h-12">
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Enviando...
          </>
        ) : (
          "Quiero mi comercio"
        )}
      </Button>
    </form>
  );
}
