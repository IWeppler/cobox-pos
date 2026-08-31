"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getMarcasExistentesAction } from "@/features/stock/actions/get-attribute-suggestions";
import type { SugerenciaValorAtributo } from "@/features/stock/actions/get-attribute-suggestions";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type MarcaComboboxProps = {
  /** "Marca", o "Laboratorio" en farmacia. */
  etiqueta: string;
  valorInicial?: string | null;
  /** El `name` del input oculto que leen las actions. */
  name?: string;
};

/**
 * La marca del producto, elegida de las que ya existen o escrita nueva.
 *
 * Mismo comportamiento que el selector de valores de Talle/Color: se escribe
 * libre, se sugiere lo que el catálogo ya usa —con cuántos productos tiene
 * cada una— y hay opción explícita de crear una nueva. El motivo es el mismo
 * problema: sin sugerencias, cada quien escribe la marca como se acuerda y el
 * catálogo termina con "popys" y "Popys" como dos marcas distintas (42 y 3
 * productos en Estilo Bonito, medido).
 *
 * Lo que NO copia del patrón de Talle/Color, a propósito: es de selección
 * ÚNICA y no parte variantes. `productos.marca` es una columna escalar del
 * producto, y `columnas-por-rubro.ts` es explícito en que marca y modelo no
 * son identificadores de variante. Tratarla como atributo duplicaría cada
 * producto por marca, que es justo lo contrario de lo que se busca.
 *
 * Las sugerencias se piden al enfocar el campo y una sola vez: en la edición
 * de un producto, la mayoría de las veces nadie toca la marca.
 */
export function MarcaCombobox({
  etiqueta,
  valorInicial,
  name = "marca",
}: MarcaComboboxProps) {
  const [valor, setValor] = useState(valorInicial ?? "");
  const [sugerencias, setSugerencias] = useState<SugerenciaValorAtributo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const pedidas = useRef(false);

  useEffect(() => {
    if (!abierto || pedidas.current) return;

    pedidas.current = true;
    setCargando(true);

    getMarcasExistentesAction()
      .then(setSugerencias)
      .finally(() => setCargando(false));
  }, [abierto]);

  const query = valor.trim().toLowerCase();
  const filtradas = query
    ? sugerencias.filter((s) => s.valor.toLowerCase().includes(query))
    : sugerencias;

  // Solo se ofrece crear cuando lo tipeado no existe ya — con cualquier
  // casing. Ofrecer "+ Crear Popys" cuando el catálogo tiene "popys" sería la
  // pantalla ayudando a duplicar.
  const yaExiste = sugerencias.some(
    (s) => s.valor.trim().toLowerCase() === query,
  );
  const mostrarCrear = query.length > 0 && !yaExiste && !cargando;

  const elegir = (nueva: string) => {
    setValor(nueva);
    setAbierto(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-foreground">
        {etiqueta}
      </Label>

      <div className="relative">
        <Input
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          placeholder="Ej: Nike"
          className="h-11 px-3 bg-sidebar rounded-lg pr-8"
          autoComplete="off"
        />

        {valor ? (
          <button
            type="button"
            aria-label={`Quitar ${etiqueta.toLowerCase()}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setValor("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}

        {abierto && (
          <div className="absolute top-full left-0 mt-2 max-h-56 w-full overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-60 p-1 flex flex-col gap-0.5">
            {cargando ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                Cargando sugerencias...
              </p>
            ) : (
              <>
                {filtradas.length > 0 ? (
                  filtradas.map((s) => (
                    <button
                      key={s.valor}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        elegir(s.valor);
                      }}
                      className="w-full flex items-baseline justify-between gap-2 text-left px-2.5 py-1.5 text-sm hover:bg-muted rounded-md transition-colors"
                    >
                      <span className="truncate">{s.valor}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {s.productos} producto{s.productos === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    {sugerencias.length === 0
                      ? "Todavía no hay marcas cargadas"
                      : "No hay sugerencias"}
                  </p>
                )}

                {mostrarCrear && (
                  <>
                    <div className="h-px bg-border my-0.5" />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        elegir(valor.trim());
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-sm text-primary font-semibold hover:bg-primary/10 rounded-md transition-colors"
                    >
                      + Crear &quot;{valor.trim()}&quot; como nueva
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <input type="hidden" name={name} value={valor.trim()} />
    </div>
  );
}
