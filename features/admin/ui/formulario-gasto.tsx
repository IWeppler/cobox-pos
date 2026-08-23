"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { SelectSimple } from "./select-simple";
import type { GastoComerz } from "@/features/admin/actions/gastos-comerz";
import { CATEGORIAS_GASTO } from "@/features/admin/lib/categorias-gasto";

/**
 * El mismo formulario para anotar y para corregir.
 *
 * Con `gasto` se precarga y manda el `id` (edición); sin él, es un alta. Que
 * sean el mismo componente es lo que evita que los dos se desincronicen —
 * agregar un campo en uno y olvidarlo en el otro. Vive en su propio archivo
 * porque lo usan dos pantallas distintas: el botón del encabezado y la lista
 * de gastos del mes.
 */
export function FormularioGasto({
  gasto,
  accion,
  error,
  guardando,
  onCancelar,
}: Readonly<{
  gasto?: GastoComerz;
  accion: (formData: FormData) => void;
  error: string | null;
  guardando: boolean;
  onCancelar: () => void;
}>) {
  // El campo `hasta` solo tiene sentido en un FIJO, y la base lo frena con un
  // CHECK. Se sigue en estado para poder mostrarlo/esconderlo al vuelo.
  const [tipo, setTipo] = useState<string>(gasto?.tipo ?? "UNICO");
  const [categoria, setCategoria] = useState<string>(gasto?.categoria ?? "infra");

  return (
    <form action={accion} className="space-y-4">
      {gasto && <input type="hidden" name="id" value={gasto.id} />}

      {/* El Select de Radix NO es un <select>: no aporta nada al FormData.
          Por eso el valor va en estado y se manda con estos hidden. */}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="categoria" value={categoria} />

      <div className="grid grid-cols-2 gap-3">
        <SelectSimple
          id="tipo"
          etiqueta="Tipo"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: "UNICO", etiqueta: "Único" },
            { valor: "FIJO", etiqueta: "Fijo (todos los meses)" },
          ]}
        />
        <SelectSimple
          id="categoria"
          etiqueta="Categoría"
          valor={categoria}
          onChange={setCategoria}
          opciones={CATEGORIAS_GASTO.map((c) => ({
            valor: c.valor,
            etiqueta: c.etiqueta,
          }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="concepto">Concepto</Label>
        <Input
          id="concepto"
          name="concepto"
          required
          maxLength={80}
          defaultValue={gasto?.concepto}
          placeholder="Vercel, sueldo de Juan, campaña de agosto…"
          className="h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="monto">Monto mensual</Label>
          <Input
            id="monto"
            name="monto"
            type="number"
            min="0"
            step="any"
            required
            defaultValue={gasto?.monto}
            className="h-10 font-mono"
          />
        </div>

        {tipo === "FIJO" && (
          <div className="space-y-2">
            <Label htmlFor="hasta">Baja (opcional)</Label>
            <Input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={gasto?.hasta ?? ""}
              className="h-10"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nota">Nota (opcional)</Label>
        <Input
          id="nota"
          name="nota"
          maxLength={200}
          defaultValue={gasto?.nota ?? ""}
          className="h-10"
          placeholder="Para acordarte por qué"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancelar}
          disabled={guardando}
        >
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={guardando}>
          {guardando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : gasto ? (
            "Guardar"
          ) : (
            "Anotar"
          )}
        </Button>
      </div>
    </form>
  );
}
