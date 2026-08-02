"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Badge } from "@/shared/ui/badge";
import {
  Receipt,
  Save,
  Loader2,
  Settings2,
  AlertCircle,
  Copy,
  Download,
  RefreshCw,
  KeyRound,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

/**
 * Lo que este panel consume de la configuración del comercio. `cuit` y
 * `condicion_iva` ya viven en configuracion_pos; `modo_facturacion` y
 * `punto_venta` TODAVÍA NO existen como columnas —la integración con ARCA está
 * simulada— así que son opcionales y caen a un default hasta que existan.
 */
export interface ConfigTicket {
  cuit?: string | null;
  condicion_iva?: string | null;
  modo_facturacion?: string | null;
  punto_venta?: string | null;
}

export function TicketPanel({ config }: Readonly<{ config: ConfigTicket }>) {
  // Estados generales
  const [modoFacturacion, setModoFacturacion] = useState(
    config?.modo_facturacion || "interno",
  );
  const [isPending, setIsPending] = useState(false);

  // Estados para simular la UI del modal de ARCA
  const [csrGenerado, setCsrGenerado] = useState("");
  const [isGeneratingCSR, setIsGeneratingCSR] = useState(false);
  const [crtFile, setCrtFile] = useState<File | null>(null);

  // Mock de datos actuales (esto luego vendrá de tu config de base de datos)
  const arcaStatus = {
    activado: false,
    cuit: config?.cuit || "No configurado",
    puntoVenta: config?.punto_venta || "PV 1",
    certificado: "Sin cargar",
    inscripcion: config?.condicion_iva || "Responsable Inscripto",
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setTimeout(() => {
      setIsPending(false);
      toast.success("Configuración fiscal actualizada");
    }, 1000);
  };

  // Funciones simuladas para la UI del Modal
  const handleGenerateCSR = () => {
    setIsGeneratingCSR(true);
    setTimeout(() => {
      setCsrGenerado(
        "-----BEGIN CERTIFICATE REQUEST-----\nMIIC1DCCAXwCAQAwTzELMAkGA1UEBhMCQVIxFTATBgNVBAgMD... (CSR de prueba generado) ...3DOERAOUAA4TBDwAwggEKAoIBAQD\n-----END CERTIFICATE REQUEST-----",
      );
      setIsGeneratingCSR(false);
      toast.success("CSR generado exitosamente");
    }, 800);
  };

  const handleCopyCSR = () => {
    navigator.clipboard.writeText(csrGenerado);
    toast.success("CSR copiado al portapapeles");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrtFile(e.target.files[0]);
    }
  };

  const handleGenerateP12 = () => {
    if (!crtFile) {
      toast.error("Seleccioná el archivo .crt primero");
      return;
    }
    toast.success("Certificado .p12 generado y guardado en el servidor");
    // Aquí cerrarías el modal y actualizarías el status
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          Configuración Fiscal y Facturación
        </CardTitle>
        <CardDescription>
          Define cómo se emitirán los comprobantes al finalizar una venta en la
          caja.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* === 1. MODO DE FACTURACIÓN === */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Modo de Operación</Label>
            <RadioGroup
              name="modo_facturacion"
              value={modoFacturacion}
              onValueChange={setModoFacturacion}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <Label
                htmlFor="modo-interno"
                className={`flex flex-col border rounded-xl p-4 cursor-pointer transition-all ${
                  modoFacturacion === "interno"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground mr-2">
                    Control Interno
                  </span>
                  <RadioGroupItem value="interno" id="modo-interno" />
                </div>
                <span className="text-xs text-muted-foreground font-normal leading-relaxed">
                  Solo emite tickets de uso interno para control de caja. No
                  tiene validez fiscal.
                </span>
              </Label>

              <Label
                htmlFor="modo-manual"
                className={`flex flex-col border rounded-xl p-4 cursor-pointer transition-all ${
                  modoFacturacion === "manual"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground mr-2">
                    Facturación Manual
                  </span>
                  <RadioGroupItem value="manual" id="modo-manual" />
                </div>
                <span className="text-xs text-muted-foreground font-normal leading-relaxed">
                  Las ventas se registran en Comerz, pero las facturas las haces
                  manualmente en la web de ARCA.
                </span>
              </Label>

              <Label
                htmlFor="modo-arca"
                className={`flex flex-col border rounded-xl p-4 cursor-pointer transition-all ${
                  modoFacturacion === "arca"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground mr-2">
                    Automática (ARCA)
                  </span>
                  <RadioGroupItem value="arca" id="modo-arca" />
                </div>
                <span className="text-xs text-muted-foreground font-normal leading-relaxed">
                  Comerz se conecta con ARCA y emite facturas electrónicas
                  válidas (con CAE) automáticamente.
                </span>
              </Label>
            </RadioGroup>
          </div>

          {/* === 2. COMPROBANTE POR DEFECTO === */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-border/50">
            <div className="space-y-2">
              <Label htmlFor="comprobante_defecto">
                Comprobante por defecto en la Caja
              </Label>
              <Select name="comprobante_defecto" defaultValue="ticket">
                <SelectTrigger id="comprobante_defecto">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticket">
                    Ticket Interno (No Fiscal)
                  </SelectItem>
                  {modoFacturacion === "arca" && (
                    <>
                      <SelectItem value="factura_c">Factura C</SelectItem>
                      <SelectItem value="factura_b">Factura B</SelectItem>
                      <SelectItem value="factura_a">Factura A</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* === 3. PANEL DE ESTADO ARCA (Solo visible si Automática) === */}
          {modoFacturacion === "arca" && (
            <div className="pt-6 border-t border-border/50 animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col border border-border rounded-xl overflow-hidden bg-muted/20">
                {/* Header del Panel */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-background">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-sm bg-[#242c4f] flex items-center justify-center">
                      <Image src="/arca.svg" alt="ARCA Logo" width={36} height={36} />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">
                        Conexión con ARCA
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mt-0.5">
                        {arcaStatus.activado ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />{" "}
                            Los servidores de ARCA funcionan correctamente
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-danger" />{" "}
                            Conexión no configurada
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* DIALOG: WIZARD DE CONFIGURACIÓN ARCA */}
                  <Dialog >
                    <DialogTrigger asChild>
                      <Button
                        variant={
                          arcaStatus.activado ? "destructive" : "default"
                        }
                        className={
                          !arcaStatus.activado
                            ? "bg-danger hover:bg-danger/90 text-white"
                            : ""
                        }
                      >
                        <Settings2 className="w-4 h-4 mr-2" />
                        {arcaStatus.activado
                          ? "Modificar ARCA"
                          : "Configurar ARCA"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="min-w-5xl p-0 overflow-hidden bg-background">
                      <div className="p-6 border-b border-border bg-muted/10">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                          <KeyRound className="w-6 h-6 text-primary" /> Generar
                          CSR y subir .crt
                        </DialogTitle>
                        <DialogDescription className="mt-1">
                          Sigue estos 3 pasos para vincular tu negocio con la
                          facturación electrónica.
                        </DialogDescription>
                      </div>

                      {/* 3 COLUMNAS DEL WIZARD */}
                      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border bg-background">
                        {/* COLUMNA 1: GENERAR CSR */}
                        <div className="p-6 space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="flex items-center justify-center w-6 h-6 rounded bg-primary text-primary-foreground text-sm font-bold">
                              1
                            </span>
                            <h4 className="font-bold">
                              Generar solicitud (CSR)
                            </h4>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            La clave privada se encripta y nunca sale de
                            nuestros servidores.
                          </p>

                          <div className="text-sm font-medium">
                            CUIT:{" "}
                            <span className="font-bold">{arcaStatus.cuit}</span>
                          </div>

                          <Button
                            onClick={handleGenerateCSR}
                            disabled={isGeneratingCSR}
                            variant="outline"
                            className="w-full bg-background"
                          >
                            {isGeneratingCSR ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            {csrGenerado ? "Regenerar CSR" : "Generar CSR"}
                          </Button>

                          <div className="relative">
                            <textarea
                              readOnly
                              value={csrGenerado}
                              placeholder="Aquí aparecerá tu código CSR..."
                              className="w-full h-32 p-3 text-[10px] font-mono rounded-md border border-input bg-muted/50 resize-none focus:outline-none"
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={handleCopyCSR}
                              disabled={!csrGenerado}
                              variant="secondary"
                              className="flex-1 text-xs h-8"
                            >
                              <Copy className="w-3 h-3 mr-1.5" /> Copiar
                            </Button>
                            <Button
                              disabled={!csrGenerado}
                              variant="secondary"
                              className="flex-1 text-xs h-8"
                            >
                              <Download className="w-3 h-3 mr-1.5" /> Descargar
                            </Button>
                          </div>
                          {csrGenerado && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Válido por 48
                              horas.
                            </p>
                          )}
                        </div>

                        {/* COLUMNA 2: INSTRUCCIONES ARCA */}
                        <div className="p-6 space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="flex items-center justify-center w-6 h-6 rounded bg-primary text-white text-sm font-bold">
                              2
                            </span>
                            <h4 className="font-bold">Subir el CSR en ARCA</h4>
                          </div>

                          <ol className="text-sm space-y-3 text-muted-foreground list-decimal list-inside marker:text-foreground marker:font-medium">
                            <li>
                              Ingresá a{" "}
                              <strong className="text-foreground">
                                afip.gov.ar
                              </strong>{" "}
                              con tu CUIT y Clave Fiscal.
                            </li>
                            <li>
                              Buscá{" "}
                              <strong className="text-foreground">
                                Administración de Certificados Digitales
                              </strong>
                              .
                            </li>
                            <li>
                              Click en{" "}
                              <strong className="text-foreground">
                                Agregar alias
                              </strong>{" "}
                              e ingresá un nombre (ej: <em>comerz_pos</em>).
                            </li>
                            <li>
                              Pegá el texto del CSR que copiaste en el paso
                              anterior (incluyendo{" "}
                              <code className="text-xs bg-muted p-0.5 rounded">
                                -----BEGIN...
                              </code>
                              ) y confirmá.
                            </li>
                            <li>
                              Hacé click en el alias creado y seleccioná{" "}
                              <strong className="text-foreground">
                                Descargar Certificado (.crt)
                              </strong>
                              .
                            </li>
                          </ol>
                        </div>

                        {/* COLUMNA 3: SUBIR CRT Y GENERAR P12 */}
                        <div className="p-6 space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="flex items-center justify-center w-6 h-6 rounded bg-primary text-white text-sm font-bold">
                              3
                            </span>
                            <h4 className="font-bold">Subir el .crt a Comerz</h4>
                          </div>

                          <p className="text-xs text-muted-foreground mb-4">
                            Subí el archivo que te dio ARCA. Comerz lo combinará
                            con tu llave privada automáticamente.
                          </p>

                          <div className="space-y-3">
                            <Label
                              htmlFor="crt_file"
                              className="cursor-pointer flex items-center justify-center w-full h-24 border-2 border-dashed border-emerald-200 dark:border-primary rounded-lg transition-colors"
                            >
                              <div className="flex flex-col items-center gap-1 text-primary">
                                <FileCheck2 className="w-6 h-6" />
                                <span className="text-sm font-medium">
                                  {crtFile
                                    ? crtFile.name
                                    : "Seleccionar archivo .crt"}
                                </span>
                              </div>
                              <Input
                                id="crt_file"
                                type="file"
                                accept=".crt"
                                className="hidden"
                                onChange={handleFileChange}
                              />
                            </Label>

                            <Button
                              onClick={handleGenerateP12}
                              disabled={!crtFile}
                              className="w-full"
                            >
                              Generar certificado .p12
                            </Button>

                            {!crtFile && (
                              <div className="flex items-center gap-2 text-[11px] text-warning bg-warning/10 p-2 rounded-lg border border-warning/20">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                Seleccioná el .crt primero.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Body del Panel (Tabla de estado) */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">ARCA activado</span>
                    <Badge
                      variant={arcaStatus.activado ? "success" : "secondary"}
                    >
                      {arcaStatus.activado ? "Sí" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">CUIT</span>
                    <span className="font-mono font-medium text-foreground">
                      {arcaStatus.cuit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground flex items-center gap-2">
                      Punto de venta
                    </span>
                    {arcaStatus.activado ? (
                      <Badge
                        variant="outline"
                        className="font-mono bg-background"
                      >
                        {arcaStatus.puntoVenta}
                      </Badge>
                    ) : (
                      <Input
                        defaultValue="1"
                        className="w-16 h-7 text-xs text-right font-mono"
                      />
                    )}
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Certificado</span>
                    <span
                      className={`font-medium ${arcaStatus.certificado === "Cargado" ? "text-success" : "text-warning"}`}
                    >
                      {arcaStatus.certificado}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50 md:col-span-2">
                    <span className="text-muted-foreground">Inscripción</span>
                    <span className="font-medium bg-muted px-2 py-0.5 rounded text-xs">
                      {arcaStatus.inscripcion}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === BOTÓN DE GUARDAR CONFIGURACIÓN === */}
          <div className="flex justify-end pt-6 border-t border-border">
            <Button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto min-w-[150px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Guardar Configuración
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
