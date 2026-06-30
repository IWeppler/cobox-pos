"use client";

import { useState, useTransition, FormEvent } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import {
  procesarPedidoAction,
  RawOrderItem,
} from "@/features/purchases/actions/create-purchase";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  CheckCircle2,
  PackagePlus,
} from "lucide-react";

type ExcelCell = string | number | boolean | Date | null | undefined;
type ExcelRow = Record<string, ExcelCell>;

const normalizeCellText = (value: ExcelCell) => String(value ?? "").trim();
const normalizeHeaderText = (value: ExcelCell) =>
  normalizeCellText(value).toUpperCase();

const isMeaningfulHeaderCell = (value: ExcelCell) => {
  const text = normalizeCellText(value);
  return text.length > 0 && !/^__EMPTY/i.test(text);
};

const findHeaderRowIndex = (rows: ExcelCell[][]) => {
  return rows.findIndex((row) => {
    const textCellCount = row.filter(isMeaningfulHeaderCell).length;
    return textCellCount > 2;
  });
};

const buildRowsFromDetectedHeaders = (rows: ExcelCell[][]): ExcelRow[] => {
  const headerRowIndex = findHeaderRowIndex(rows);

  if (headerRowIndex === -1) {
    return [];
  }

  const headers = rows[headerRowIndex].map((cell) => normalizeHeaderText(cell));

  return rows.slice(headerRowIndex + 1).map((row) => {
    return headers.reduce<ExcelRow>((acc, header, columnIndex) => {
      if (!isMeaningfulHeaderCell(header)) return acc;
      acc[header] = row[columnIndex] ?? "";
      return acc;
    }, {});
  });
};

export function ImportarPedidoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [proveedor, setProveedor] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      toast.error("Por favor, selecciona un archivo Excel o CSV.");
      return;
    }
    if (!proveedor.trim()) {
      toast.error("Por favor, ingresa el nombre del proveedor.");
      return;
    }

    startTransition(async () => {
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawRows = XLSX.utils.sheet_to_json<ExcelCell[]>(worksheet, {
          header: 1,
          raw: false,
          defval: "", // Para que las celdas vacías vengan como string vacío
        });

        const jsonData = buildRowsFromDetectedHeaders(rawRows);

        if (jsonData.length === 0) {
          throw new Error(
            "El archivo parece estar vacío o no tiene el formato correcto.",
          );
        }

        // --- COLUMNAS CONOCIDAS ---
        const knownNameCols = [
          "DESCRIPCIÓN",
          "DESCRIPCION",
          "PRODUCTO",
          "NOMBRE",
          "ARTICULO",
        ];
        const knownCantCols = ["CANTIDAD", "CANT", "STOCK"];
        const knownPriceCols = [
          "PRECIO UNITARIO",
          "COSTO",
          "PRECIO",
          "PRECIO COSTO",
        ];

        // --- MAPEO DINÁMICO (Compatible con JSONB Variantes) ---
        const mappedItems: RawOrderItem[] = jsonData
          .map((row, index) => {
            let desc = "";
            let cant: ExcelCell = 0;
            let precio: ExcelCell = 0;
            const extraAttributes: string[] = [];

            // Iteramos sobre las columnas reales del Excel
            Object.keys(row).forEach((key) => {
              const upperKey = normalizeHeaderText(key);
              const cellValue = row[key];

              if (!upperKey || upperKey.includes("__EMPTY")) return;
              if (cellValue === null || cellValue === undefined) return;

              const normalizedValue = normalizeCellText(cellValue);
              if (!normalizedValue) return;

              if (knownNameCols.includes(upperKey)) {
                desc = normalizedValue;
              } else if (knownCantCols.includes(upperKey)) {
                cant = cellValue;
              } else if (knownPriceCols.includes(upperKey)) {
                precio = cellValue;
              } else {
                // Es una columna desconocida (Ej: "Color", "Talle", "Maceta")
                // La guardamos para armar una variante compuesta estilo JSONB
                extraAttributes.push(`${upperKey}: ${normalizedValue}`);
              }
            });

            // if (!desc) {
            //   console.warn(
            //     `Fila ${index + 2} omitida por no tener descripción válida.`,
            //   );
            //   return null;
            // }

            if (!desc && !cant && !precio && extraAttributes.length === 0)
              return null;

            if (!desc) {
              console.warn(
                `Fila ${index + 2} omitida por no tener descripcion valida.`,
              );
              return null;
            }

            const normalizedDesc = normalizeHeaderText(desc);
            const duplicatedHeaderValues = [
              "PRODUCTO",
              "DESCRIPCIÓN",
              "DESCRIPCION",
              "ARTICULO",
            ];

            if (duplicatedHeaderValues.includes(normalizedDesc)) {
              return null;
            }

            const parseNumber = (val: ExcelCell) => {
              if (typeof val === "number") return val;
              if (!val) return 0;
              return Number(
                val
                  .toString()
                  .replaceAll(/[^0-9,-]+/g, "")
                  .replace(",", "."),
              );
            };

            // Construimos una raw_variante rica (Ej: "Color: Rojo / Maceta: N12")
            // Esto ayudará inmensamente a la conciliación a auto-detectar las variantes.
            const raw_variante =
              extraAttributes.length > 0
                ? extraAttributes.join(" / ")
                : "Unico";

            return {
              raw_nombre: desc,
              raw_variante: raw_variante,
              cantidad: Math.max(0, parseInt(String(cant)) || 0),
              precio_costo: Math.max(0, parseNumber(precio)),
            };
          })
          .filter((item): item is RawOrderItem => item !== null);

        if (mappedItems.length === 0) {
          throw new Error(
            "No se detectaron datos válidos en el archivo. Verifica que las columnas estén correctas.",
          );
        }

        const result = await procesarPedidoAction(proveedor, mappedItems);

        if (result.success) {
          toast.success("Pedido pre-cargado. Redirigiendo a Conciliación...");
          setIsOpen(false);
          setFile(null);
          setProveedor("");
          router.push(`/compras/merge/${result.ordenId}`);
        } else {
          throw new Error(
            result.error || "Error en el servidor al guardar el pedido.",
          );
        }
      } catch (error: unknown) {
        console.error(error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Ocurrió un error al procesar el archivo.";
        toast.error(errorMessage);
      }
    });
  };

  const handleClose = () => {
    setFile(null);
    setProveedor("");
    setIsOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else setIsOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="hidden sm:flex h-10 border-border/60 bg-background hover:bg-muted font-semibold shadow-none"
        >
          <PackagePlus className="w-4 h-4 mr-2 text-emerald-600" />
          Ingresar Remito
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[450px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Importar Remito / Pedido
          </DialogTitle>
          <DialogDescription>
            Sube el Excel o CSV enviado por tu proveedor. El sistema
            identificará los productos, creará las variantes nuevas y detectará
            cambios de precio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label
              htmlFor="proveedor"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Nombre del Proveedor
            </Label>
            <Input
              id="proveedor"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej: Distribuidora Fabbro"
              disabled={isPending}
              required
              className="h-11 shadow-none bg-muted/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Archivo a procesar (.xlsx, .csv)
            </Label>
            <Label
              htmlFor="archivo_excel"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                file
                  ? "border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50"
                  : "border-border bg-muted/20 hover:bg-emerald-50 hover:border-emerald-200"
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center px-4">
                {isPending ? (
                  <Loader2 className="w-8 h-8 mb-3 text-emerald-600 animate-spin" />
                ) : file ? (
                  <CheckCircle2 className="w-8 h-8 mb-3 text-emerald-600" />
                ) : (
                  <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground" />
                )}

                <p className="mb-1 text-sm text-foreground font-medium">
                  {file ? (
                    <span className="text-emerald-700 font-bold">
                      {file.name}
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold text-emerald-600">
                        Haz clic para subir
                      </span>{" "}
                      tu remito
                    </>
                  )}
                </p>
                {file && !isPending && (
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                    Clic para cambiar de archivo
                  </p>
                )}
                {!file && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Columnas requeridas: Descripción, Cantidad, Costo. (Puedes
                    incluir Color, Talle, Maceta...)
                  </p>
                )}
              </div>
              <Input
                id="archivo_excel"
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                onChange={handleFileChange}
                disabled={isPending}
              />
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
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
              className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-none px-6"
              disabled={isPending || !file || !proveedor.trim()}
            >
              {isPending ? "Procesando..." : "Leer Archivo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
