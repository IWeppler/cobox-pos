"use client";

import { useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useActiveCategories } from "@/features/stock/hooks/use-active-categories";
import { esNombreVarianteUnica } from "@/features/stock/utils/parse-legacy-variant";
import type { CampoDeFoco } from "../hooks/use-carga-rapida";
import type { LineaCarga, LineaCargaNueva } from "../types";

/** Identifica una celda concreta en el DOM. Es como el hook nombra a dónde
 * mandar el foco sin tener una ref por input: pide "esta línea, este campo" y
 * la tabla lo resuelve. */
function celdaId(linea: LineaCarga, campo: CampoDeFoco): string {
  return `${linea.clienteLineaId}:${campo}`;
}

/**
 * Una fila = un producto, una columna = un dato. Todo se carga en la misma
 * grilla y nada abre un modal: el alta de un producto nuevo son tres números
 * y dos textos, y una pantalla de por medio para eso cuesta más que la
 * carga entera.
 *
 * El modal sigue existiendo SOLO para la grilla de combinaciones (5 talles x
 * 3 colores en un producto), que es lo único que no entra en una fila.
 */
const COLUMNAS =
  "grid-cols-[minmax(180px,1fr)_120px_88px_112px_104px_104px_84px_40px]";

/** Ancho mínimo de la tabla. Abajo de eso el contenedor scrollea en
 * horizontal en vez de apretar las columnas hasta que no se pueda tipear. */
const ANCHO_MINIMO = "min-w-[832px]";

function formatearPrecio(valor: number): string {
  return `$${valor.toLocaleString("es-AR")}`;
}

function totalUnidades(
  linea: Extract<LineaCargaNueva, { tieneVariantes: true }>,
) {
  return linea.variantes.reduce(
    (total, v) => total + (Number.parseInt(v.stock, 10) || 0),
    0,
  );
}

/** Unidades de una línea con la variante ya resuelta por el maestro: hay una
 * sola combinación, así que su stock ES la cantidad de la línea. */
function stockVarianteFija(
  linea: Extract<LineaCargaNueva, { tieneVariantes: true }>,
): number {
  return Number.parseInt(linea.variantes[0]?.stock ?? "0", 10) || 0;
}

/**
 * Enter y Escape en cualquier celda vuelven al campo de escaneo.
 *
 * Es el atajo que cierra el ciclo de la carga: terminada la fila, lo que
 * sigue SIEMPRE es el producto que sigue. La tecla "f" del POS no alcanza acá
 * porque con el foco dentro de un campo una letra suelta se escribe, no se
 * dispara (ver seguroEnCampoDeTexto en use-atajos-teclado) — y así tiene que
 * ser, o el lector de códigos dispararía atajos a mitad de un escaneo.
 *
 * Enter y no Tab: Tab ya recorre la fila celda por celda y eso también hace
 * falta. Son los dos movimientos, no uno.
 */
function alSalirDeLaCelda(
  volver: (() => void) | undefined,
): React.KeyboardEventHandler<HTMLInputElement> | undefined {
  if (!volver) return undefined;
  return (e) => {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    e.preventDefault();
    e.currentTarget.blur();
    volver();
  };
}

/** Celda numérica. `value` 0 se muestra vacío: un "0" precargado invita a
 * tipear al lado y terminar cargando 0500. */
function CeldaNumero({
  value,
  onChange,
  invalido,
  entero,
  titulo,
  onVolver,
  celda,
}: Readonly<{
  value: number;
  onChange: (valor: number) => void;
  invalido?: boolean;
  entero?: boolean;
  titulo: string;
  onVolver?: () => void;
  celda?: string;
}>) {
  return (
    <Input
      type="number"
      data-celda={celda}
      aria-label={titulo}
      min={entero ? 1 : 0}
      step={entero ? 1 : "any"}
      value={value > 0 ? value : ""}
      placeholder="0"
      onKeyDown={alSalirDeLaCelda(onVolver)}
      onChange={(e) => {
        const crudo = e.target.value;
        const parseado = entero
          ? Number.parseInt(crudo, 10)
          : Number.parseFloat(crudo);
        onChange(Number.isNaN(parseado) ? 0 : parseado);
      }}
      className={`h-9 w-full text-center px-1 ${
        invalido ? "border-destructive focus-visible:ring-destructive" : ""
      }`}
    />
  );
}

/** Celda de texto. Talle, color y código son texto libre; el nombre es lo
 * único obligatorio y por eso es el que se marca cuando falta. */
function CeldaTexto({
  value,
  onChange,
  placeholder,
  invalido,
  alineacion = "text-center",
  titulo,
  onVolver,
  celda,
}: Readonly<{
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  invalido?: boolean;
  alineacion?: string;
  titulo: string;
  onVolver?: () => void;
  celda?: string;
}>) {
  return (
    <Input
      type="text"
      data-celda={celda}
      aria-label={titulo}
      value={value}
      placeholder={placeholder}
      onKeyDown={alSalirDeLaCelda(onVolver)}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full px-2 ${alineacion} ${
        invalido ? "border-destructive focus-visible:ring-destructive" : ""
      }`}
    />
  );
}

/** Valor que no se edita en esta fila (precio de un producto que ya existe,
 * columna que no aplica). Se muestra igual para que la columna no quede
 * hueca y se lea de arriba abajo. */
function CeldaTextoFijo({
  children,
  titulo,
}: Readonly<{ children: React.ReactNode; titulo?: string }>) {
  return (
    <span
      title={titulo}
      className="h-9 flex items-center justify-center text-xs text-muted-foreground truncate px-1"
    >
      {children}
    </span>
  );
}

interface CargaRapidaListaProps {
  lineas: LineaCarga[];
  onUpdateCantidad: (clienteLineaId: string, cantidad: number) => void;
  onUpdatePrecio: (
    clienteLineaId: string,
    campo: "precioCompra" | "precioVenta",
    valor: number,
  ) => void;
  onUpdateTexto: (
    clienteLineaId: string,
    campo: "nombre" | "codigo" | "talle" | "color",
    valor: string,
  ) => void;
  /** Devuelve el foco al campo de escaneo: Enter o Escape en cualquier celda. */
  onVolverAlBuscador?: () => void;
  /** Celda que tiene que recibir el foco (la fila recién agregada). */
  focoPendiente?: { clienteLineaId: string; campo: CampoDeFoco } | null;
  onFocoAplicado?: () => void;
  onRemove: (clienteLineaId: string) => void;
  onEditarNueva: (linea: LineaCargaNueva) => void;
  onConfirmar: () => void;
  isConfirming: boolean;
}

export function CargaRapidaLista({
  lineas,
  onUpdateCantidad,
  onUpdatePrecio,
  onUpdateTexto,
  onVolverAlBuscador,
  focoPendiente,
  onFocoAplicado,
  onRemove,
  onEditarNueva,
  onConfirmar,
  isConfirming,
}: Readonly<CargaRapidaListaProps>) {
  const categorias = useActiveCategories();

  // Aplica el foco que pidió el hook al crear una fila. Va por el DOM y no por
  // refs: son ocho inputs por fila y un mapa de refs que se arma y desarma con
  // cada línea es más código para el mismo efecto.
  useEffect(() => {
    if (!focoPendiente) return;
    const celda = document.querySelector<HTMLInputElement>(
      `[data-celda="${focoPendiente.clienteLineaId}:${focoPendiente.campo}"]`,
    );
    celda?.focus();
    celda?.select();
    onFocoAplicado?.();
  }, [focoPendiente, onFocoAplicado]);

  if (lineas.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground italic">
          Escaneá o escribí un producto para empezar la carga.
        </p>
      </div>
    );
  }

  const unidades = lineas.reduce((total, linea) => {
    if (linea.kind === "EXISTENTE") return total + linea.cantidad;
    if (!linea.tieneVariantes) return total + linea.cantidad;
    return total + totalUnidades(linea);
  }, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className={ANCHO_MINIMO}>
          <div
            className={`grid ${COLUMNAS} gap-2 px-4 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-medium`}
          >
            <span>Producto</span>
            <span className="text-center">Código</span>
            <span className="text-center">Talle</span>
            <span className="text-center">Color</span>
            <span className="text-center">Costo</span>
            <span className="text-center">Venta</span>
            <span className="text-center">Cant.</span>
            <span />
          </div>

          <div className="divide-y divide-border">
            {lineas.map((linea) => {
              // Variante ya resuelta por el maestro: no hay matriz que editar,
              // se carga precio y cantidad acá mismo.
              const varianteFija =
                linea.kind === "NUEVA" &&
                linea.tieneVariantes &&
                linea.varianteFijaLabel
                  ? linea
                  : null;

              // Producto nuevo simple: todo se carga en la fila.
              const nuevaSimple =
                linea.kind === "NUEVA" && !linea.tieneVariantes ? linea : null;

              // Grilla de combinaciones armada a mano: es lo único que no
              // entra en una fila y sigue mandando al modal.
              const conGrilla =
                linea.kind === "NUEVA" && linea.tieneVariantes && !varianteFija
                  ? linea
                  : null;

              const editableInline = varianteFija ?? nuevaSimple;
              const cantidad = varianteFija
                ? stockVarianteFija(varianteFija)
                : linea.kind === "EXISTENTE" || !linea.tieneVariantes
                  ? linea.cantidad
                  : totalUnidades(linea);

              return (
                <div
                  key={linea.clienteLineaId}
                  className={`grid ${COLUMNAS} gap-2 px-4 py-2 items-center`}
                >
                  {/* Producto */}
                  <div className="min-w-0">
                    {linea.kind === "EXISTENTE" ? (
                      <>
                        <p className="text-sm font-medium text-foreground truncate">
                          {linea.nombreProducto}
                          {/* Mismo criterio que el formulario de edición: el
                              placeholder se escribe "Único" o "Unico" según
                              por dónde entró el producto, y en los dos casos
                              no es una variante que valga la pena mostrar. */}
                          {!esNombreVarianteUnica(linea.nombreDisplay)
                            ? ` · ${linea.nombreDisplay}`
                            : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Ya existe
                        </p>
                      </>
                    ) : (
                      <>
                        <CeldaTexto
                          onVolver={onVolverAlBuscador}
                          titulo="Nombre del producto"
                          celda={celdaId(linea, "nombre")}
                          value={linea.nombre}
                          placeholder="Nombre del producto"
                          alineacion="text-left"
                          invalido={!linea.nombre.trim()}
                          onChange={(v) =>
                            onUpdateTexto(linea.clienteLineaId, "nombre", v)
                          }
                        />
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {linea.marca ? ` · ${linea.marca}` : ""}
                          {linea.categoriaId
                            ? ` · ${
                                categorias.find(
                                  (c) => c.id === linea.categoriaId,
                                )?.nombre ?? "categoría"
                              }`
                            : ""}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Código */}
                  {nuevaSimple ? (
                    <CeldaTexto
                      onVolver={onVolverAlBuscador}
                      titulo="Código"
                      celda={celdaId(linea, "codigo")}
                      value={nuevaSimple.codigo ?? ""}
                      placeholder="—"
                      onChange={(v) =>
                        onUpdateTexto(linea.clienteLineaId, "codigo", v)
                      }
                    />
                  ) : (
                    <CeldaTextoFijo>
                      {(linea.kind === "EXISTENTE"
                        ? linea.sku
                        : linea.codigo) || "—"}
                    </CeldaTextoFijo>
                  )}

                  {/* Talle y Color. Con variantes ya resueltas las dos
                      columnas son una sola celda: los atributos no son
                      necesariamente talle y color (memoria, medida) y viven
                      en la grilla, no acá. */}
                  {nuevaSimple ? (
                    <>
                      <CeldaTexto
                        onVolver={onVolverAlBuscador}
                        titulo="Talle"
                        celda={celdaId(linea, "talle")}
                        value={nuevaSimple.talle ?? ""}
                        placeholder="—"
                        onChange={(v) =>
                          onUpdateTexto(linea.clienteLineaId, "talle", v)
                        }
                      />
                      <CeldaTexto
                        onVolver={onVolverAlBuscador}
                        titulo="Color"
                        celda={celdaId(linea, "color")}
                        value={nuevaSimple.color ?? ""}
                        placeholder="—"
                        onChange={(v) =>
                          onUpdateTexto(linea.clienteLineaId, "color", v)
                        }
                      />
                    </>
                  ) : varianteFija ? (
                    <div className="col-span-2 flex items-center justify-center gap-1.5 min-w-0">
                      <span
                        title="Variante definida por el Catálogo Maestro"
                        className="text-[10px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50 truncate"
                      >
                        {varianteFija.varianteFijaLabel}
                      </span>
                      {/* Escape para el caso raro: el maestro trae el dato
                          incompleto y hay que corregir la grilla. */}
                      <button
                        type="button"
                        onClick={() => onEditarNueva(varianteFija)}
                        className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer shrink-0"
                      >
                        editar
                      </button>
                    </div>
                  ) : conGrilla ? (
                    <div className="col-span-2 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-2 text-xs font-medium w-full"
                        onClick={() => onEditarNueva(conGrilla)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        {conGrilla.variantes.length} var.
                      </Button>
                    </div>
                  ) : (
                    <div className="col-span-2">
                      <CeldaTextoFijo>—</CeldaTextoFijo>
                    </div>
                  )}

                  {/* Costo. NO se marca inválido: es opcional a propósito
                      (ver validarLinea en confirmar-carga). */}
                  {editableInline ? (
                    <CeldaNumero
                      onVolver={onVolverAlBuscador}
                      titulo="Costo"
                      celda={celdaId(linea, "precioCompra")}
                      value={editableInline.precioCompra}
                      onChange={(v) =>
                        onUpdatePrecio(linea.clienteLineaId, "precioCompra", v)
                      }
                    />
                  ) : linea.kind === "EXISTENTE" ? (
                    <CeldaTextoFijo>
                      {formatearPrecio(linea.precioCosto)}
                    </CeldaTextoFijo>
                  ) : (
                    <CeldaNumero
                      onVolver={onVolverAlBuscador}
                      titulo="Costo"
                      celda={celdaId(linea, "precioCompra")}
                      value={linea.precioCompra}
                      onChange={(v) =>
                        onUpdatePrecio(linea.clienteLineaId, "precioCompra", v)
                      }
                    />
                  )}

                  {/* Venta. Sin esto no hay qué cobrar: queda en rojo hasta
                      cargarse. */}
                  {linea.kind === "EXISTENTE" ? (
                    <CeldaTextoFijo>
                      {formatearPrecio(linea.precioVenta)}
                    </CeldaTextoFijo>
                  ) : (
                    <CeldaNumero
                      onVolver={onVolverAlBuscador}
                      titulo="Precio de venta"
                      celda={celdaId(linea, "precioVenta")}
                      value={linea.precioVenta}
                      invalido={linea.precioVenta <= 0}
                      onChange={(v) =>
                        onUpdatePrecio(linea.clienteLineaId, "precioVenta", v)
                      }
                    />
                  )}

                  {/* Cantidad. Con grilla armada a mano no hay una cantidad
                      única: se muestran las unidades totales y se editan en
                      la grilla. */}
                  {conGrilla ? (
                    <CeldaTextoFijo titulo="Unidades de todas las combinaciones">
                      {cantidad} u.
                    </CeldaTextoFijo>
                  ) : (
                    <CeldaNumero
                      onVolver={onVolverAlBuscador}
                      titulo="Cantidad"
                      celda={celdaId(linea, "cantidad")}
                      value={cantidad}
                      entero
                      invalido={cantidad <= 0}
                      onChange={(v) =>
                        onUpdateCantidad(linea.clienteLineaId, v)
                      }
                    />
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(linea.clienteLineaId)}
                    aria-label="Quitar línea"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Button
        type="button"
        className="w-full h-12 text-sm font-semibold"
        disabled={isConfirming}
        onClick={onConfirmar}
      >
        {isConfirming
          ? "Confirmando..."
          : `Confirmar carga (${lineas.length} línea${
              lineas.length === 1 ? "" : "s"
            } · ${unidades} u.)`}
        {/* El atajo se anuncia en el botón: un atajo que no está escrito en
            ningún lado lo usa quien lo programó y nadie más. */}
        {isConfirming ? null : (
          <span className="ml-2 text-[10px] font-normal opacity-70 hidden sm:inline">
            Ctrl+Espacio
          </span>
        )}
      </Button>
    </div>
  );
}
