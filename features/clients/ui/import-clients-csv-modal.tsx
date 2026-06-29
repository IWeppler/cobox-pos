"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { importarClientesCSVAction } from "../actions/manage-clients";

interface ImportClientsCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportClientsCsvModal({
  open,
  onOpenChange,
}: Readonly<ImportClientsCsvModalProps>) {
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    } else {
      setFileName(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!fileName || !file) {
      toast.error("Por favor, selecciona un archivo CSV primero.");
      return;
    }

    try {
      // 🚀 FIX: Leemos el texto plano aquí en el navegador para asegurar que
      // la información no se pierda al viajar al Server Action de Next.js
      const text = await file.text();

      const formData = new FormData();
      formData.append("csv_text", text);

      startTransition(async () => {
        const result = await importarClientesCSVAction(formData);
        if (result.success) {
          toast.success(`Se importaron ${result.count} clientes exitosamente.`);
          setFileName(null); // Reseteamos el archivo
          onOpenChange(false);
        } else {
          toast.error(result.error);
        }
      });
    } catch (error) {
      toast.error("Error al leer el archivo. Intenta nuevamente.");
    }
  };

  const handleClose = () => {
    setFileName(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Importar Clientes
          </DialogTitle>
          <DialogDescription>
            Sube un archivo <strong className="text-foreground">.CSV</strong>{" "}
            con tu base de datos actual para migrarlos al sistema de forma
            masiva.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          <div className="bg-muted/30 border border-border p-4 rounded-xl">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              Formato esperado (Columnas)
            </Label>
            <code className="text-xs bg-background border border-border px-2 py-1 rounded block mb-1">
              nombre, telefono, dni, deuda_inicial
            </code>
            <p className="text-[10px] text-muted-foreground mt-2">
              Nota: Si incluyes la columna &quot;deuda_inicial&quot;, el sistema
              creará automáticamente un registro de deuda en la cuenta corriente
              del cliente.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="csv-upload"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                fileName
                  ? "border-emerald-500 bg-background"
                  : "border-border bg-muted/30 hover:bg-emerald-50 hover:border-emerald-200"
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center px-4">
                {isPending ? (
                  <Loader2 className="w-8 h-8 mb-3 text-emerald-600 animate-spin" />
                ) : fileName ? (
                  <CheckCircle2 className="w-8 h-8 mb-3 text-emerald-600" />
                ) : (
                  <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground" />
                )}

                <p className="mb-1 text-sm text-foreground font-medium">
                  {fileName ? (
                    <span className="text-emerald-700 font-bold">
                      {fileName}
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold text-emerald-600">
                        Haz clic para subir
                      </span>{" "}
                      tu archivo CSV
                    </>
                  )}
                </p>
                {fileName && !isPending && (
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    Clic para cambiar de archivo
                  </p>
                )}
              </div>
              <Input
                id="csv-upload"
                name="file"
                type="file"
                accept=".csv"
                required
                className="hidden"
                onChange={handleFileChange}
                disabled={isPending}
              />
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
              className="shadow-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-none"
              disabled={isPending || !fileName}
            >
              {isPending ? "Importando..." : "Comenzar Importación"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
