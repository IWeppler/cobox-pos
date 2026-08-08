"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { ItemPlan, PlanImport } from "@/features/stock/lib/import-productos-plan";
import {
  contarFiltros,
  filtrarItems,
  type FiltroPreview,
} from "@/features/stock/lib/filtrar-plan-import";
import type { ImportacionPrevia } from "@/features/stock/actions/confirmar-import-productos";

/**
 * Vista previa del import.
 *
 * Está separada del modal porque tiene lógica propia (filtros, corrección
 * inline, paginado) y porque el modal ya arrastra la máquina de estados de
 * los tres pasos.
 *
 * Dos decisiones de tamaño: el archivo puede traer hasta MAX_FILAS_IMPORT
 * (3000) filas, así que ni se renderizan todas de una (`LIMITE_INICIAL`) ni
 * se espera que el usuario las lea — los filtros y los contadores son la
 * forma de llegar a las que importan. Y las filas se dibujan una sola vez
 * con flex reflowable en vez de tabla + tarjetas duplicadas: dos markups
 * para la misma fila se desincronizan al primer cambio.
 */

const LIMITE_INICIAL = 200;
const PASO_LIMITE = 200;

const ETIQUETA_ACCION: Record<string, string> = {
  CREAR_PRODUCTO: "Producto nuevo",
  CREAR_VARIANTE: "Variante nueva",
  SUMAR_STOCK: "Suma stock",
};

interface ImportPreviewProps {
  plan: PlanImport;
  invalidas: number;
  columnasIgnoradas: string[];
  importacionPrevia: ImportacionPrevia | null;
  filasCambiadas: number[];
  /** Se está recalculando el plan después de una corrección inline. */
  recalculando: boolean;
  isPending: boolean;
  /** Segundos que lleva la escritura, para que la espera no sea ciega. */
  segundos: number;
  onCorregirPrecio: (fila: number, precio: number | null) => void;
  onReset: () => void;
  onConfirmar: () => void;
}

export function ImportPreview({
  plan,
  invalidas,
  columnasIgnoradas,
  importacionPrevia,
  filasCambiadas,
  recalculando,
  isPending,
  segundos,
  onCorregirPrecio,
  onReset,
  onConfirmar,
}: Readonly<ImportPreviewProps>) {
  const [filtro, setFiltro] = useState<FiltroPreview>("todas");
  const [limite, setLimite] = useState(LIMITE_INICIAL);
  // Lo tipeado en las correcciones, para que el input responda al toque sin
  // esperar a que vuelva el plan recalculado del server.
  const [precios, setPrecios] = useState<Record<number, string>>({});

  const cambiadas = useMemo(() => new Set(filasCambiadas), [filasCambiadas]);
  const conteo = useMemo(
    () => contarFiltros(plan.items, cambiadas),
    [plan.items, cambiadas],
  );
  // Si el filtro elegido se queda sin filas (se corrigieron todos los errores)
  // cae a "todas": una lista vacía sin explicación parece que se rompió. Se
  // deriva en el render en vez de corregir el estado en un efecto.
  const filtroEfectivo: FiltroPreview =
    filtro !== "todas" && conteo[filtro] === 0 ? "todas" : filtro;

  const visibles = useMemo(
    () => filtrarItems(plan.items, filtroEfectivo, cambiadas),
    [plan.items, filtroEfectivo, cambiadas],
  );

  const cambiarFiltro = (f: FiltroPreview) => {
    setFiltro(f);
    setLimite(LIMITE_INICIAL);
  };

  const bloqueadas = conteo.error;
  const hayAlgoParaImportar = bloqueadas < plan.items.length;

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Resumen
          label="Productos nuevos"
          valor={plan.resumen.productosNuevos}
          activo={filtroEfectivo === "CREAR_PRODUCTO"}
          onClick={
            conteo.CREAR_PRODUCTO > 0
              ? () => cambiarFiltro("CREAR_PRODUCTO")
              : undefined
          }
        />
        <Resumen
          label="Variantes nuevas"
          valor={plan.resumen.variantesNuevas}
          activo={filtroEfectivo === "CREAR_VARIANTE"}
          onClick={
            conteo.CREAR_VARIANTE > 0
              ? () => cambiarFiltro("CREAR_VARIANTE")
              : undefined
          }
        />
        <Resumen label="Unidades" valor={plan.resumen.unidadesTotales} />
        <Resumen
          label="Con IMEI"
          valor={plan.resumen.unidadesSerie}
          activo={filtroEfectivo === "imei"}
          onClick={conteo.imei > 0 ? () => cambiarFiltro("imei") : undefined}
        />
      </div>

      {isPending && (
        <Aviso tono="warn">
          Escribiendo {plan.items.length - bloqueadas} fila(s)… ({segundos}s). Es
          una sola transacción: o entra todo lo que puede entrar, o no entra
          nada. No cierres ni recargues la ventana — cerrarla no cancela lo que
          ya está corriendo en el server.
        </Aviso>
      )}

      {filasCambiadas.length > 0 && (
        <Aviso tono="error">
          El catálogo cambió mientras revisabas (alguien creó un producto, cargó
          un IMEI o agregó una variante). <strong>No se importó nada.</strong>{" "}
          {filasCambiadas.length} fila(s) resuelven distinto ahora. Revisalas y
          confirmá de nuevo.
        </Aviso>
      )}

      {bloqueadas > 0 && (
        <Aviso tono="error">
          {bloqueadas} fila(s) no se van a importar. El resto sí.
          {conteo.CREAR_PRODUCTO + conteo.CREAR_VARIANTE + conteo.SUMAR_STOCK ===
          0
            ? " Así como está, no se escribiría nada."
            : ""}
        </Aviso>
      )}

      {invalidas > 0 && (
        <Aviso tono="warn">
          {invalidas} fila(s) del archivo se descartaron al leerlo (sin nombre de
          producto o stock inválido).
        </Aviso>
      )}

      {columnasIgnoradas.length > 0 && (
        <Aviso tono="warn">
          Columnas que no se reconocen y se ignoran:{" "}
          {columnasIgnoradas.join(", ")}.
        </Aviso>
      )}

      {importacionPrevia ? (
        <Aviso tono="error">
          Este archivo ya se importó el{" "}
          {formatearFechaHora(importacionPrevia.creado_en)} (
          {importacionPrevia.filas_ok} de {importacionPrevia.filas_totales} filas
          OK). Importarlo de nuevo vuelve a SUMAR el stock, no lo reemplaza.
        </Aviso>
      ) : (
        <Aviso tono="warn">
          Si volvés a subir este mismo archivo, el sistema lo reconoce y no lo
          importa dos veces. Un archivo con cualquier cambio (una cantidad, una
          fila) cuenta como otro archivo y sí suma stock.
        </Aviso>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip
          label="Todas"
          n={conteo.todas}
          activo={filtroEfectivo === "todas"}
          onClick={() => cambiarFiltro("todas")}
        />
        <Chip
          label="No se importan"
          n={conteo.error}
          tono="error"
          activo={filtroEfectivo === "error"}
          onClick={() => cambiarFiltro("error")}
        />
        <Chip
          label="Para revisar"
          n={conteo.aviso}
          tono="warn"
          activo={filtroEfectivo === "aviso"}
          onClick={() => cambiarFiltro("aviso")}
        />
        {conteo.cambiadas > 0 && (
          <Chip
            label="Cambiaron"
            n={conteo.cambiadas}
            tono="warn"
            activo={filtroEfectivo === "cambiadas"}
            onClick={() => cambiarFiltro("cambiadas")}
          />
        )}
        <Chip
          label="Suma stock"
          n={conteo.SUMAR_STOCK}
          activo={filtroEfectivo === "SUMAR_STOCK"}
          onClick={() => cambiarFiltro("SUMAR_STOCK")}
        />
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="hidden sm:flex items-center gap-3 bg-muted/50 px-3 py-2 text-xs font-semibold">
          <span className="w-10 shrink-0">Fila</span>
          <span className="flex-1">Producto</span>
          <span className="w-28 shrink-0">Acción</span>
          <span className="w-14 shrink-0 text-right">Un.</span>
        </div>

        <ul className="max-h-[45vh] sm:max-h-72 overflow-y-auto">
          {visibles.slice(0, limite).map((item) => (
            <FilaPreview
              key={item.fila}
              item={item}
              cambiada={cambiadas.has(item.fila)}
              valorPrecio={precios[item.fila]}
              onPrecio={(texto) => {
                setPrecios((p) => ({ ...p, [item.fila]: texto }));
                const n = Number(texto.replace(",", "."));
                onCorregirPrecio(
                  item.fila,
                  texto.trim() === "" || Number.isNaN(n) ? null : n,
                );
              }}
            />
          ))}

          {visibles.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Ninguna fila entra en este filtro.
            </li>
          )}
        </ul>

        {visibles.length > limite && (
          <button
            type="button"
            onClick={() => setLimite((l) => l + PASO_LIMITE)}
            className="w-full border-t border-border bg-muted/30 py-3 text-xs font-semibold hover:bg-muted/60"
          >
            Mostrando {limite} de {visibles.length} · ver{" "}
            {Math.min(PASO_LIMITE, visibles.length - limite)} más
          </button>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={isPending}
          className="h-11 sm:h-9 shadow-none"
        >
          Elegir otro archivo
        </Button>
        <Button
          type="button"
          // Reimportar es una decisión explícita, con el texto cambiado para
          // que no se apriete en piloto automático.
          onClick={onConfirmar}
          disabled={isPending || recalculando || !hayAlgoParaImportar}
          className={`h-11 sm:h-9 shadow-none ${
            importacionPrevia
              ? "bg-danger text-white hover:bg-danger/90"
              : "bg-success text-white hover:bg-success/90"
          }`}
        >
          {isPending || recalculando ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {recalculando ? "Recalculando..." : "Importando..."}
            </>
          ) : importacionPrevia ? (
            "Importar igual (suma stock de nuevo)"
          ) : (
            "Confirmar e importar"
          )}
        </Button>
      </div>
    </div>
  );
}

function FilaPreview({
  item,
  cambiada,
  valorPrecio,
  onPrecio,
}: Readonly<{
  item: ItemPlan;
  cambiada: boolean;
  valorPrecio: string | undefined;
  onPrecio: (texto: string) => void;
}>) {
  const bloqueada = item.errores.length > 0;

  return (
    <li
      className={`flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 border-t border-border px-3 py-2.5 text-xs ${
        cambiada ? "bg-warning/10" : ""
      }`}
    >
      <span className="hidden sm:block w-10 shrink-0 text-muted-foreground tabular-nums">
        {item.fila}
      </span>

      <div className="flex-1 min-w-0">
        <div className="font-medium">
          <span className="sm:hidden text-muted-foreground tabular-nums mr-1.5">
            #{item.fila}
          </span>
          {item.producto}
        </div>

        {Object.entries(item.atributos).length > 0 && (
          <div className="text-muted-foreground">
            {Object.entries(item.atributos)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        )}
        {item.imei && (
          <div className="text-muted-foreground">IMEI {item.imei}</div>
        )}
        {cambiada && (
          <div className="text-warning font-medium mt-0.5">
            Cambió desde que revisaste
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

        {item.correcciones.includes("PRECIO_VENTA") && (
          <label className="flex items-center gap-2 mt-1.5">
            <span className="text-muted-foreground shrink-0">
              Precio de venta
            </span>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="0"
              value={valorPrecio ?? ""}
              onChange={(e) => onPrecio(e.target.value)}
              className="h-9 w-28 text-xs"
            />
          </label>
        )}
      </div>

      {/* sm:contents desarma este wrapper en desktop: las dos celdas pasan a
          ser hijas del flex de la fila. En mobile quedan juntas en una línea. */}
      <div className="flex items-center justify-between gap-2 sm:contents">
        <span
          className={`sm:w-28 sm:shrink-0 ${
            bloqueada ? "text-danger font-medium" : ""
          }`}
        >
          {bloqueada ? "No se importa" : ETIQUETA_ACCION[item.accion]}
        </span>
        <span className="sm:w-14 sm:shrink-0 sm:text-right tabular-nums">
          {bloqueada ? "—" : `+${item.stock}`}
        </span>
      </div>
    </li>
  );
}

function Chip({
  label,
  n,
  activo,
  tono,
  onClick,
}: Readonly<{
  label: string;
  n: number;
  activo: boolean;
  tono?: "error" | "warn";
  onClick: () => void;
}>) {
  const color =
    n === 0
      ? "text-muted-foreground"
      : tono === "error"
        ? "text-danger"
        : tono === "warn"
          ? "text-warning"
          : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={n === 0}
      className={`h-9 sm:h-8 px-3 rounded-lg border text-xs font-semibold disabled:opacity-50 disabled:cursor-default ${
        activo ? "border-foreground bg-muted" : "border-border bg-muted/30"
      } ${color}`}
    >
      {label} · {n}
    </button>
  );
}

function Resumen({
  label,
  valor,
  activo,
  onClick,
}: Readonly<{
  label: string;
  valor: number;
  activo?: boolean;
  onClick?: () => void;
}>) {
  const contenido = (
    <>
      <div className="text-lg font-bold tabular-nums">{valor}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </>
  );

  const clases = `bg-muted/30 border rounded-xl px-3 py-2 text-left ${
    activo ? "border-foreground" : "border-border"
  }`;

  if (!onClick) return <div className={clases}>{contenido}</div>;

  return (
    <button type="button" onClick={onClick} className={`${clases} hover:bg-muted/60`}>
      {contenido}
    </button>
  );
}

function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
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
