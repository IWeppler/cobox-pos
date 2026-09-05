"use client";

import { useState, FormEvent, useRef } from "react";
import { parsearCantidadDeEntrada } from "@/shared/lib/unidad-venta";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import {
  procesarPedidoAction,
  RawOrderItem,
} from "@/features/purchases/actions/create-purchase";
import { parseNumeroLocal } from "@/features/stock/lib/parse-productos-csv";
import { ALIAS_COLUMNA_GENERO } from "@/shared/lib/alias-columna-genero";
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
  Download,
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

/**
 * Clave de comparación de headers: mayúsculas + sin tildes + sin espacios,
 * guiones ni guiones bajos. Así "precio_venta", "Precio Venta" y
 * "PRECIO-VENTA" son la misma columna, venga la planilla de donde venga.
 *
 * Se usa SOLO para comparar contra las listas de columnas conocidas: el
 * header original (normalizeHeaderText) sigue siendo el que se guarda como
 * nombre de atributo de la variante, porque acá "TALLE DE PRENDA" se
 * volvería "TALLEDEPRENDA".
 */
const normalizeHeaderKey = (value: ExcelCell) =>
  normalizeHeaderText(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s\-_]+/g, "");

const matchColumna = (header: string, columnas: readonly string[]) =>
  columnas.some((c) => normalizeHeaderKey(c) === normalizeHeaderKey(header));

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
      // "PRECIO" a secas sigue siendo COSTO: en un remito el precio que manda
      // el proveedor es lo que le cobra al comercio. El precio al público solo
      // se toma cuando la columna lo dice explícitamente.
      const knownPriceCols = [
        "PRECIO UNITARIO",
        "COSTO",
        "PRECIO",
        "PRECIO COSTO",
        "PRECIO COMPRA",
      ];
      const knownVentaCols = [
        "PRECIO VENTA",
        "PRECIO DE VENTA",
        "VENTA",
        "PVP",
        "PRECIO PUBLICO",
        "PRECIO AL PUBLICO",
        "PRECIO SUGERIDO",
      ];

      const knownCategoryCols = ["CATEGORIA", "CATEGORÍA", "RUBRO", "TIPO"];
      // La MISMA lista que reconoce la planilla propia. Cuando eran dos, esta
      // conocía solo dos formas y una columna "SEXO" o "PUBLICO" se iba al
      // `else` de abajo, o sea a `extraAttributes`: cada variante terminaba con
      // "SEXO: Mujer" pegado. Eso es lo que la migración 20260904160000 tuvo
      // que sacar de 2.238 variantes.
      const knownGeneroCols = ALIAS_COLUMNA_GENERO;
      const knownSkuCols = ["SKU", "CODIGO", "CÓDIGO", "COD"];
      const knownMarcaCols = ["MARCA"];

      const mappedItems: RawOrderItem[] = jsonData
        .map((row): RawOrderItem | null => {
          let desc = "";
          let cant: ExcelCell = 0;
          let precio: ExcelCell = 0;
          let precioVenta: ExcelCell = "";
          let rawCategoria = "";
          let rawGenero = "";
          let sku = "";
          let marca = "";
          const extraAttributes: string[] = [];

          Object.keys(row).forEach((key) => {
            const upperKey = normalizeHeaderText(key);
            const cellValue = row[key];

            if (!upperKey || upperKey.includes("__EMPTY")) return;
            if (cellValue === null || cellValue === undefined) return;

            const normalizedValue = normalizeCellText(cellValue);
            if (!normalizedValue) return;

            if (matchColumna(upperKey, knownNameCols)) {
              desc = normalizedValue;
            } else if (matchColumna(upperKey, knownCantCols)) {
              cant = cellValue;
            } else if (matchColumna(upperKey, knownVentaCols)) {
              // Antes de la de costo: "PRECIO VENTA" no puede caer en el
              // genérico "PRECIO" y entrar como costo.
              precioVenta = cellValue;
            } else if (matchColumna(upperKey, knownPriceCols)) {
              precio = cellValue;
            } else if (matchColumna(upperKey, knownCategoryCols)) {
              rawCategoria = normalizedValue;
            } else if (matchColumna(upperKey, knownGeneroCols)) {
              rawGenero = normalizedValue;
            } else if (matchColumna(upperKey, knownSkuCols)) {
              // Columna propia, NUNCA se mezcla con raw_variante — si no,
              // el SKU terminaría pisando el nombre visible de la variante
              // (nombre_display) y colándose como atributo filtrable.
              sku = normalizedValue;
            } else if (matchColumna(upperKey, knownMarcaCols)) {
              // Columna propia también — alimenta productos.marca al crear
              // el producto en la conciliación, no un atributo de variante.
              marca = normalizedValue;
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

          // parseNumeroLocal es el mismo parser de la importación de
          // productos: tolera "$", separador de miles y coma decimal, y —a
          // diferencia del parseo que había acá— no rompe "1234.50", que
          // antes perdía el punto y se leía 123450.
          const parseNumber = (val: ExcelCell) => {
            if (typeof val === "number") return val;
            if (!val) return 0;
            return parseNumeroLocal(val.toString()) ?? 0;
          };

          // SEÑALES CRUDAS DE CATEGORÍA Y GÉNERO — la resolución real
          // (matchear contra el árbol de categorías, decidir si el género
          // sobrevive como atributo) pasa a vivir en el servidor
          // (resolverCategoriaImport, con acceso a la tabla `categorias`).
          // Acá SOLO separamos y canonicalizamos texto: nunca más
          // "primera palabra pluralizada" como categoría, ni asumir que
          // toda fila lleva género.
          const GENERO_CANONICO: Record<string, string> = {
            hombre: "Hombre",
            mujer: "Mujer",
            niño: "Niño",
            nene: "Niño",
            niña: "Niña",
            nena: "Niña",
            unisex: "Unisex",
            bebe: "Bebé",
            bebé: "Bebé",
          };
          const rawGeneroLimpio = rawGenero.toLowerCase().trim();
          const rawCategoriaLimpio = rawCategoria.toLowerCase().trim();

          // Proveedores que usan la columna "Categoría" para poner en
          // realidad el género (sin columna Género separada) — se
          // reinterpreta como señal de género, no como categoría.
          const generoDesdeCategoria =
            !rawGenero && GENERO_CANONICO[rawCategoriaLimpio];

          const generoFinal = rawGenero
            ? (GENERO_CANONICO[rawGeneroLimpio] ?? rawGenero.trim())
            : generoDesdeCategoria || null;

          const categoriaFinal =
            rawCategoria && !generoDesdeCategoria ? rawCategoria.trim() : null;

          // Armamos la string de atributos "libres" (talle, color, etc.) —
          // el género YA NO viaja acá: el servidor decide si sobrevive
          // como atributo (solo Ropa Bebé) o se descarta.
          const raw_variante =
            extraAttributes.length > 0 ? extraAttributes.join(" / ") : "Unico";

          return {
            raw_nombre: desc,
            raw_variante: raw_variante,
            raw_categoria: categoriaFinal,
            raw_genero: generoFinal,
            raw_sku: sku || null,
            raw_marca: marca || null,
            // parseInt truncaba "12,5" a 12: un remito de carne entraba con
            // medio kilo de menos, sin aviso.
            cantidad: Math.max(0, parsearCantidadDeEntrada(cant)),
            precio_costo: Math.max(0, parseNumber(precio)),
            // null (no 0) cuando la planilla no trae la columna: 0 querría
            // decir "vender a $0" y en la conciliación pisaría el precio que
            // ya tiene el producto.
            precio_venta: normalizeCellText(precioVenta)
              ? Math.max(0, parseNumber(precioVenta))
              : null,
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
    >
      {/* El DialogTrigger ha sido adaptado para que funcione perfectamente 
        dentro de tu DropdownMenu (o fuera de él) sin romperse. 
      */}
      {!hideTrigger && (
        <DialogTrigger asChild>
          <button className="w-full flex items-center justify-start h-9 px-2 text-sm font-medium cursor-pointer rounded-md hover:bg-muted transition-colors text-foreground">
            <PackagePlus className="w-4 h-4 mr-2 shrink-0 text-success" />
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
            <FileSpreadsheet className="w-5 h-5 text-success" />
            Importar Remito / Pedido
          </DialogTitle>
          <DialogDescription>
            Sube el Excel o CSV enviado por tu proveedor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <a
            href="/plantilla-productos.csv"
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium text-success hover:text-success/80 hover:underline w-fit"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar plantilla
          </a>

          <div className="bg-muted/30 border border-border p-4 rounded-xl">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              Formato esperado (Columnas)
            </Label>
            <code className="text-xs bg-background border border-border px-2 py-1 rounded block mb-1">
              producto, cantidad, precio_costo, precio_venta, categoria, talle,
              color, genero, marca, sku
            </code>
            <p className="text-[10px] text-muted-foreground mt-2">
              Solo &quot;producto&quot; y &quot;cantidad&quot; son obligatorias.
              Cualquier otra columna (talle, color...) se guarda como atributo
              de la variante.
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Si la planilla trae <strong>precio_venta</strong>, se usa como
              precio al público sugerido en la conciliación — igual lo podés
              cambiar antes de aprobar. Sin esa columna,
              &quot;precio&quot; se toma como costo.
            </p>
          </div>

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
                    ? "border-success bg-success/10 cursor-pointer"
                    : "border-border bg-muted/20 hover:bg-success/10 hover:border-success cursor-pointer"
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center px-4 pointer-events-none">
                {isLoading ? (
                  <Loader2 className="w-8 h-8 mb-3 text-success animate-spin" />
                ) : file ? (
                  <CheckCircle2 className="w-8 h-8 mb-3 text-success" />
                ) : (
                  <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground" />
                )}

                <p className="mb-1 text-sm text-foreground font-medium">
                  {file ? (
                    <span className="text-success font-bold">
                      {file.name}
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold text-success">
                        Haz clic para subir
                      </span>{" "}
                      o arrastra tu archivo
                    </>
                  )}
                </p>
                {!file && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Columnas requeridas: Descripción, Cantidad. (Opcional:
                    Precio Venta, Color, Talle, Género, SKU...)
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
