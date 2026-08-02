"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  XCircle,
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
import { leerPlanillaProductos } from "@/features/stock/lib/leer-planilla-productos";
import {
  parseProductosSheet,
  type FilaImport,
  type FilaInvalida,
} from "@/features/stock/lib/parse-productos-csv";
import type { PlanImport } from "@/features/stock/lib/import-productos-plan";
import { previewImportProductosAction } from "@/features/stock/actions/preview-import-productos";
import {
  confirmarImportProductosAction,
  type ResultadoFilaImport,
} from "@/features/stock/actions/confirmar-import-productos";

interface ImportProductosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama después de un import con al menos una fila escrita. */
  onImportado?: () => void;
}

type Paso = "archivo" | "preview" | "resultado";

const ETIQUETA_ACCION: Record<string, string> = {
  CREAR_PRODUCTO: "Producto nuevo",
  CREAR_VARIANTE: "Variante nueva",
  SUMAR_STOCK: "Suma stock",
};

export function ImportProductosModal({
  open,
  onOpenChange,
  onImportado,
}: Readonly<ImportProductosModalProps>) {
  const [paso, setPaso] = useState<Paso>("archivo");
  const [fileName, setFileName] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [invalidas, setInvalidas] = useState<FilaInvalida[]>([]);
  const [columnasIgnoradas, setColumnasIgnoradas] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanImport | null>(null);
  const [resultados, setResultados] = useState<ResultadoFilaImport[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setPaso("archivo");
    setFileName(null);
    setFilas([]);
    setInvalidas([]);
    setColumnasIgnoradas([]);
    setPlan(null);
    setResultados([]);
  };

  const cerrar = () => {
    if (isPending) return;
    reset();
    onOpenChange(false);
  };

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLeyendo(true);

    try {
      const rows = await leerPlanillaProductos(file);
      const parsed = parseProductosSheet(rows);

      if (parsed.error) {
        toast.error(parsed.error);
        setLeyendo(false);
        return;
      }
      if (parsed.filas.length === 0) {
        toast.error("El archivo no tiene ninguna fila con producto.");
        setLeyendo(false);
        return;
      }

      setFilas(parsed.filas);
      setInvalidas(parsed.invalidas);
      setColumnasIgnoradas(parsed.columnasIgnoradas);

      const res = await previewImportProductosAction(parsed.filas);
      if (res.error || !res.plan) {
        toast.error(res.error ?? "No se pudo analizar el archivo.");
        setLeyendo(false);
        return;
      }

      setPlan(res.plan);
      setPaso("preview");
    } catch (err) {
      console.error("[IMPORT PRODUCTOS] Error leyendo el archivo:", err);
      toast.error("No se pudo leer el archivo. ¿Es un CSV o XLSX válido?");
    } finally {
      setLeyendo(false);
    }
  };

  const handleConfirmar = () => {
    // Sin withTimeout a propósito: esta acción escribe stock y el timeout
    // del cliente no cancela el server. Ver comentario en la action.
    startTransition(async () => {
      const res = await confirmarImportProductosAction(filas);

      if (res.error) {
        toast.error(res.error);
        return;
      }

      setResultados(res.resultados);
      setPaso("resultado");

      if (res.totalOk > 0) {
        toast.success(`${res.totalOk} filas importadas.`);
        onImportado?.();
      }
      if (res.totalError > 0) {
        toast.warning(`${res.totalError} filas no se importaron.`);
      }
    });
  };

  const itemsConProblema =
    plan?.items.filter((i) => i.errores.length > 0 || i.avisos.length > 0) ??
    [];

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[720px] border-border bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-success" />
            Importar productos
          </DialogTitle>
          <DialogDescription>
            Subí un CSV o Excel. Se revisa todo antes de escribir nada.
          </DialogDescription>
        </DialogHeader>

        {paso === "archivo" && (
          <div className="space-y-5 pt-2">
            <div className="bg-muted/30 border border-border p-4 rounded-xl">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                Columnas reconocidas
              </Label>
              <code className="text-xs bg-background border border-border px-2 py-1 rounded block">
                categoria, codigo_barras, producto, color, memoria, stock, imei,
                precio_costo, precio_venta
              </code>
              <p className="text-[11px] text-muted-foreground mt-2">
                Solo <strong>producto</strong> es obligatoria. Las demás son
                opcionales: una planilla de indumentaria con
                categoria/producto/color/stock importa igual.
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Si una fila trae <strong>imei</strong>, vale 1 unidad y se
                ignora la columna stock: cada aparato va en su propia fila.
              </p>
            </div>

            <Label
              htmlFor="planilla-upload"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                fileName
                  ? "border-success bg-background"
                  : "border-border bg-muted/30 hover:border-success/50"
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center px-4">
                {leyendo ? (
                  <Loader2 className="w-8 h-8 mb-3 text-success animate-spin" />
                ) : (
                  <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground" />
                )}
                <p className="mb-1 text-sm text-foreground font-medium">
                  {leyendo
                    ? "Analizando el archivo..."
                    : "Hacé clic para subir tu CSV o Excel"}
                </p>
              </div>
              <Input
                id="planilla-upload"
                type="file"
                accept=".csv,.tsv,.xlsx,.xls"
                className="hidden"
                onChange={handleArchivo}
                disabled={leyendo}
              />
            </Label>
          </div>
        )}

        {paso === "preview" && plan && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Resumen
                label="Productos nuevos"
                valor={plan.resumen.productosNuevos}
              />
              <Resumen
                label="Variantes nuevas"
                valor={plan.resumen.variantesNuevas}
              />
              <Resumen label="Unidades" valor={plan.resumen.unidadesTotales} />
              <Resumen label="Con IMEI" valor={plan.resumen.unidadesSerie} />
            </div>

            {plan.resumen.filasConError > 0 && (
              <Aviso tono="error">
                {plan.resumen.filasConError} fila(s) no se van a importar. El
                resto sí.
              </Aviso>
            )}

            {invalidas.length > 0 && (
              <Aviso tono="warn">
                {invalidas.length} fila(s) del archivo se descartaron al leerlo
                (sin nombre de producto o stock inválido).
              </Aviso>
            )}

            {columnasIgnoradas.length > 0 && (
              <Aviso tono="warn">
                Columnas que no se reconocen y se ignoran:{" "}
                {columnasIgnoradas.join(", ")}.
              </Aviso>
            )}

            <Aviso tono="warn">
              Las filas sin IMEI no tienen control de duplicados: si importás el
              mismo archivo dos veces, el stock se suma de nuevo. Las filas con
              IMEI sí rebotan.
            </Aviso>

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Fila</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">Acción</th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Un.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((item) => (
                      <tr
                        key={item.fila}
                        className="border-t border-border align-top"
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.fila}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{item.producto}</div>
                          {Object.entries(item.atributos).length > 0 && (
                            <div className="text-muted-foreground">
                              {Object.entries(item.atributos)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                            </div>
                          )}
                          {item.imei && (
                            <div className="text-muted-foreground">
                              IMEI {item.imei}
                            </div>
                          )}
                          {item.errores.map((e) => (
                            <div key={e} className="text-danger mt-0.5">
                              {e}
                            </div>
                          ))}
                          {item.avisos.map((a) => (
                            <div key={a} className="text-warning mt-0.5">
                              {a}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2">
                          {item.errores.length > 0 ? (
                            <span className="text-danger font-medium">
                              No se importa
                            </span>
                          ) : (
                            ETIQUETA_ACCION[item.accion]
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.errores.length > 0 ? "—" : `+${item.stock}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {itemsConProblema.length > 0
                ? `${itemsConProblema.length} fila(s) tienen algo para revisar.`
                : "Ninguna fila tiene problemas."}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={isPending}
                className="shadow-none"
              >
                Elegir otro archivo
              </Button>
              <Button
                type="button"
                onClick={handleConfirmar}
                disabled={
                  isPending || plan.items.every((i) => i.errores.length > 0)
                }
                className="bg-success text-white hover:bg-success/90 shadow-none"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  `Confirmar e importar`
                )}
              </Button>
            </div>
          </div>
        )}

        {paso === "resultado" && (
          <div className="space-y-4 pt-2">
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Fila</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.map((r) => (
                      <tr key={r.fila} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.fila}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.producto}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-start gap-1.5 ${
                              r.ok ? "text-success" : "text-danger"
                            }`}
                          >
                            {r.ok ? (
                              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            )}
                            {r.detalle}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                className="shadow-none"
              >
                Importar otro archivo
              </Button>
              <Button
                type="button"
                onClick={cerrar}
                className="bg-success text-white hover:bg-success/90"
              >
                Listo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Resumen({ label, valor }: Readonly<{ label: string; valor: number }>) {
  return (
    <div className="bg-muted/30 border border-border rounded-xl px-3 py-2">
      <div className="text-lg font-bold tabular-nums">{valor}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Aviso({
  tono,
  children,
}: Readonly<{ tono: "error" | "warn"; children: React.ReactNode }>) {
  const clases =
    tono === "error"
      ? "border-danger/20 bg-danger/10 text-danger"
      : "border-warning/20 bg-warning/10 text-warning";

  return (
    <div
      className={`flex items-start gap-2 text-xs border rounded-lg px-3 py-2 ${clases}`}
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
