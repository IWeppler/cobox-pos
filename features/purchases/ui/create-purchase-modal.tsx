"use client";

import { useState, FormEvent, useRef } from "react";
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
type ImportarPedidoModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

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
    return headers.reduce((acc: ExcelRow, header, columnIndex) => {
      if (!isMeaningfulHeaderCell(header)) return acc;
      acc[header] = row[columnIndex] ?? "";
      return acc;
    }, {});
  });
};

export function ImportarPedidoModal({
  open,
  onOpenChange,
  hideTrigger = false,
}: Readonly<ImportarPedidoModalProps>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [proveedor, setProveedor] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    } else {
      setFile(null);
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error("Por favor, selecciona un archivo Excel o CSV.");
      return;
    }
    if (!proveedor.trim()) {
      toast.error("Por favor, ingresa el nombre del proveedor.");
      return;
    }

    setIsLoading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = XLSX.utils.sheet_to_json<ExcelCell[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
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

      // Ampliamos las columnas de categoría para capturar su "Hombre/Mujer"
      const knownCategoryCols = [
        "CATEGORIA",
        "CATEGORÍA",
        "RUBRO",
        "TIPO",
        "GENERO",
        "GÉNERO",
      ];

      const mappedItems: RawOrderItem[] = jsonData
        .map((row): RawOrderItem | null => {
          let desc = "";
          let cant: ExcelCell = 0;
          let precio: ExcelCell = 0;
          let rawCategoriaOrGenero = "";
          const extraAttributes: string[] = [];

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
            } else if (knownCategoryCols.includes(upperKey)) {
              rawCategoriaOrGenero = normalizedValue;
            } else {
              extraAttributes.push(`${upperKey}: ${normalizedValue}`);
            }
          });

          if (!desc && !cant && !precio && extraAttributes.length === 0)
            return null;

          if (!desc) return null;

          const normalizedDesc = normalizeHeaderText(desc);
          const duplicatedHeaderValues = [
            "PRODUCTO",
            "DESCRIPCIÓN",
            "DESCRIPCION",
            "ARTICULO",
          ];
          if (duplicatedHeaderValues.includes(normalizedDesc)) return null;

          const parseNumber = (val: ExcelCell) => {
            if (typeof val === "number") return val;
            if (!val) return 0;
            return Number(
              val
                .toString()
                .replace(/[^0-9,-]+/g, "")
                .replace(",", "."),
            );
          };

          // 🚀 MAGIA SEMÁNTICA: EXTRACCIÓN DE CATEGORÍA Y GÉNERO
          let categoriaFinal = "General";

          // 1. Extraemos la primera palabra del nombre como Categoría (Ej: "Campera de eco cuero" -> "Campera")
          const primeraPalabra = desc.split(" ")[0];
          if (primeraPalabra) {
            // Capitalizamos la primera letra para que quede lindo
            categoriaFinal =
              primeraPalabra.charAt(0).toUpperCase() +
              primeraPalabra.slice(1).toLowerCase();

            // Pluralizamos automáticamente los casos más comunes de indumentaria para que los pills queden mejor ("Camperas" en vez de "Campera")
            if (
              categoriaFinal.endsWith("a") ||
              categoriaFinal.endsWith("o") ||
              categoriaFinal.endsWith("e")
            ) {
              categoriaFinal += "s";
            }
          }

          // 2. Evaluamos si lo que ella puso en la primera columna era en realidad el Género
          const rawLimpio = rawCategoriaOrGenero.toLowerCase().trim();
          const isGenero = [
            "hombre",
            "mujer",
            "niño",
            "niña",
            "unisex",
            "bebe",
            "bebé",
          ].includes(rawLimpio);

          if (isGenero) {
            // Si es un género, lo mandamos a las variantes (JSONB)
            extraAttributes.push(`Género: ${rawCategoriaOrGenero.trim()}`);
          } else if (
            rawCategoriaOrGenero &&
            rawCategoriaOrGenero.trim() !== ""
          ) {
            // Si no era género y ella escribió una categoría explícita, respetamos lo que ella puso
            categoriaFinal = rawCategoriaOrGenero.trim();
          }

          // Armamos la string que luego se convierte en JSONB
          const raw_variante =
            extraAttributes.length > 0 ? extraAttributes.join(" / ") : "Unico";

          return {
            raw_nombre: desc,
            raw_variante: raw_variante,
            raw_categoria: categoriaFinal, // <--- El Auto-Split actuando aquí
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
        setOpen(false);
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setFile(null);
    setProveedor("");
    setOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else setOpen(true);
      }}
      modal={false}
    >
      {/* El DialogTrigger ha sido adaptado para que funcione perfectamente 
        dentro de tu DropdownMenu (o fuera de él) sin romperse. 
      */}
      {!hideTrigger && (
        <DialogTrigger asChild>
          <button className="w-full flex items-center justify-start h-9 px-2 text-sm font-medium cursor-pointer rounded-md hover:bg-muted transition-colors text-foreground">
            <PackagePlus className="w-4 h-4 mr-2 shrink-0 text-emerald-600" />
            Ingresar Remito
          </button>
        </DialogTrigger>
      )}

      <DialogContent
        className="sm:max-w-[450px] border-border bg-card"
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
        onFocusOutside={(event) => {
          event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Importar Remito / Pedido
          </DialogTitle>
          <DialogDescription>
            Sube el Excel o CSV enviado por tu proveedor.
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
              placeholder="Ej: Mayorista"
              disabled={isLoading}
              required
              className="h-11 shadow-none bg-muted/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Archivo a procesar (.xlsx, .csv)
            </Label>

            <button
              type="button"
              onClick={handleTriggerClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              disabled={isLoading}
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl transition-colors ${
                isLoading
                  ? "border-border bg-muted/50 cursor-not-allowed opacity-70"
                  : file
                    ? "border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 cursor-pointer"
                    : "border-border bg-muted/20 hover:bg-emerald-50 hover:border-emerald-200 cursor-pointer"
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center px-4 pointer-events-none">
                {isLoading ? (
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
                      o arrastra tu archivo
                    </>
                  )}
                </p>
                {!file && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Columnas requeridas: Descripción, Cantidad. (Opcional:
                    Color, Talle, Género...)
                  </p>
                )}
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              style={{ display: "none" }}
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="shadow-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="px-6"
              disabled={isLoading || !file || !proveedor.trim()}
            >
              {isLoading ? "Procesando Archivo..." : "Leer Archivo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
