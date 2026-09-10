"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import {
  buscarDuplicadoAction,
  type DuplicadoEncontrado,
} from "../actions/buscar-duplicado";

/**
 * "Ya tenés un producto que se llama así".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EN EL ALTA Y NO AL RENOMBRAR
 *
 * El 10/9/2026 un remito creó "REMERONES VANIC OVERSIZE" cuando ese producto
 * ya existía con el nombre idéntico. Nadie renombró nada: el duplicado nació
 * en el alta. De los 11 duplicados reales que quedan en el SaaS, todos
 * nacieron así — de un remito o de una carga, no de una edición. Un aviso al
 * renombrar habría llegado tarde a todos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS NIVELES, PORQUE SI NO SE IGNORA
 *
 * Solo el nombre da 42 coincidencias en el SaaS y 31 son legítimas: la misma
 * REMERA BASICA en HOMBRE y en MUJER son dos productos. Por eso el idéntico
 * —nombre + categoría + marca— sale en ámbar y con una acción, y el homónimo
 * sale gris y no recomienda nada. Un cartel que también aparece cuando está
 * todo bien es un cartel que se deja de leer, y entonces tampoco frena los 11
 * que importan.
 *
 * No bloquea el guardado: dos productos pueden llamarse igual a propósito, y
 * no hay índice único sobre el nombre justamente por eso.
 */
export function AvisoProductoDuplicado({
  nombre,
  categoriaId,
  marca,
  productoId,
}: Readonly<{
  nombre: string;
  categoriaId?: string | null;
  marca?: string | null;
  /** Al editar, para no avisar que un producto choca consigo mismo. */
  productoId?: string;
}>) {
  const [duplicado, setDuplicado] = useState<DuplicadoEncontrado | null>(null);

  useEffect(() => {
    const texto = nombre.trim();
    // Menos de tres letras es todavía alguien tipeando: buscar ahí es pegarle
    // a la base en cada tecla para no decir nada útil.
    if (texto.length < 3) {
      setDuplicado(null);
      return;
    }

    let vigente = true;
    const t = setTimeout(async () => {
      const r = await buscarDuplicadoAction({
        nombre: texto,
        categoriaId: categoriaId ?? null,
        marca: marca ?? null,
        productoId,
      });
      // La respuesta de una búsqueda vieja no puede pisar a la nueva: entre
      // que sale y vuelve, la persona siguió escribiendo.
      if (vigente) setDuplicado(r);
    }, 400);

    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [nombre, categoriaId, marca, productoId]);

  if (!duplicado) return null;

  const esIdentico = duplicado.nivel === "IDENTICO";

  return (
    <p
      className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
        esIdentico
          ? "border border-warning/40 bg-warning/10 text-foreground/90"
          : "text-muted-foreground"
      }`}
    >
      {esIdentico ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span>{duplicado.mensaje}</span>
    </p>
  );
}
