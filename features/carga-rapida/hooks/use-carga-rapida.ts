"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Producto } from "@/entities/productos/types";
import { matchPorNombre, matchSkuExacto, normalizarQuery } from "../lib/matching";
import { confirmarCargaAction } from "../actions/confirmar-carga";
import type { LineaCarga, LineaCargaExistente, LineaCargaNueva } from "../types";

type AltaRapidaPendiente = {
  nombrePrefill: string;
  codigoPrefill: string;
  queryOriginal: string;
  editando: LineaCargaNueva | null;
};

type VarianteResuelta = {
  varianteId: string;
  productoId: string;
  nombreDisplay: string;
  nombreProducto: string;
  sku: string | null;
  precioCosto: number;
  precioVenta: number;
};

/** Heurística simple: un código/SKU escaneado no tiene espacios; un
 * nombre de producto tipeado a mano casi siempre sí. No hay datos de
 * sku reales en prod todavía contra los que afinar el patrón. */
function pareceCodigo(q: string): boolean {
  return !/\s/.test(q);
}

export function useCargaRapida(productos: Producto[]) {
  const [lineas, setLineas] = useState<LineaCarga[]>([]);
  const [query, setQuery] = useState("");
  const [pickerCandidatos, setPickerCandidatos] = useState<Producto[] | null>(
    null,
  );
  const [variantSelectorProducto, setVariantSelectorProducto] =
    useState<Producto | null>(null);
  const [altaRapida, setAltaRapida] = useState<AltaRapidaPendiente | null>(
    null,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [recargoGlobal, setRecargoGlobal] = useState<number | "">("");

  const inputRef = useRef<HTMLInputElement>(null);

  const modalAbierto =
    pickerCandidatos !== null ||
    variantSelectorProducto !== null ||
    altaRapida !== null;

  useEffect(() => {
    if (!modalAbierto) inputRef.current?.focus();
  }, [modalAbierto]);

  function resolverVariante(payload: VarianteResuelta) {
    setLineas((prev) => {
      const idx = prev.findIndex(
        (l): l is LineaCargaExistente =>
          l.kind === "EXISTENTE" && l.varianteId === payload.varianteId,
      );
      if (idx >= 0) {
        const copia = [...prev];
        const actual = copia[idx] as LineaCargaExistente;
        copia[idx] = { ...actual, cantidad: actual.cantidad + 1 };
        return copia;
      }
      const nueva: LineaCargaExistente = {
        kind: "EXISTENTE",
        clienteLineaId: crypto.randomUUID(),
        varianteId: payload.varianteId,
        productoId: payload.productoId,
        nombreDisplay: payload.nombreDisplay,
        nombreProducto: payload.nombreProducto,
        sku: payload.sku,
        cantidad: 1,
        precioCosto: payload.precioCosto,
        precioVenta: payload.precioVenta,
      };
      return [...prev, nueva];
    });
    setPickerCandidatos(null);
    setVariantSelectorProducto(null);
  }

  function incrementarLinea(clienteLineaId: string) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.clienteLineaId !== clienteLineaId) return l;
        if (l.kind === "NUEVA" && l.tieneVariantes) return l;
        return { ...l, cantidad: l.cantidad + 1 };
      }),
    );
  }

  function abrirEdicionLineaNueva(linea: LineaCargaNueva) {
    setAltaRapida({
      queryOriginal: linea.queryOriginal,
      nombrePrefill: linea.nombre,
      codigoPrefill: linea.codigo ?? "",
      editando: linea,
    });
  }

  function seleccionarProducto(producto: Producto) {
    const variantes = producto.producto_variantes ?? [];
    if (variantes.length === 0) {
      toast.error(
        `"${producto.nombre}" no tiene variantes cargadas — no se puede recibir stock para este producto todavía.`,
      );
      setPickerCandidatos(null);
      return;
    }
    if (variantes.length === 1) {
      resolverVariante({
        varianteId: variantes[0].id,
        productoId: producto.id,
        nombreDisplay: variantes[0].nombre_display,
        nombreProducto: producto.nombre,
        sku: variantes[0].sku ?? null,
        precioCosto: variantes[0].costo ?? producto.precio_costo,
        precioVenta: variantes[0].precio ?? producto.precio,
      });
      return;
    }
    setPickerCandidatos(null);
    setVariantSelectorProducto(producto);
  }

  function procesarEnter(rawQuery: string) {
    const q = rawQuery.trim();
    if (!q) return;

    // 1. Match exacto de SKU/código de barras. El mismo código puede
    // identificar varios talles/colores de un mismo modelo — o, en datos
    // sucios, hasta productos distintos — así que nunca se toma "el
    // primero": con 1 sola variante resuelve directo, con más se abre el
    // mismo selector que ya se usa para nombre-ambiguo.
    const matchesSku = matchSkuExacto(productos, q);
    if (matchesSku.length === 1) {
      const m = matchesSku[0];
      resolverVariante({
        varianteId: m.variante.id,
        productoId: m.producto.id,
        nombreDisplay: m.variante.nombre_display,
        nombreProducto: m.producto.nombre,
        sku: m.variante.sku ?? null,
        precioCosto: m.variante.costo ?? m.producto.precio_costo,
        precioVenta: m.variante.precio ?? m.producto.precio,
      });
      setQuery("");
      return;
    }
    if (matchesSku.length > 1) {
      const productosUnicos = Array.from(
        new Map(matchesSku.map((m) => [m.producto.id, m.producto])).values(),
      );
      if (productosUnicos.length === 1) {
        setVariantSelectorProducto(productosUnicos[0]);
      } else {
        setPickerCandidatos(productosUnicos);
      }
      setQuery("");
      return;
    }

    // 2. Dedupe contra líneas NUEVA ya agregadas en esta sesión — tiene
    // que ir antes de la búsqueda por nombre porque el producto todavía
    // no existe en la base. Matchea contra el texto que disparó el alta,
    // pero TAMBIÉN contra el nombre y el código que se hayan cargado en el
    // formulario: si el alta se disparó escaneando "remera" y ahí se le
    // cargó el código "1420", un reescaneo posterior de "1420" (o de
    // "remera" de nuevo) tiene que sumar a la MISMA línea, no abrir el
    // alta rápida de nuevo.
    const normalizado = normalizarQuery(q);
    const lineaNueva = lineas.find(
      (l): l is LineaCargaNueva =>
        l.kind === "NUEVA" &&
        (l.queryOriginal === normalizado ||
          normalizarQuery(l.nombre) === normalizado ||
          (l.codigo !== null && normalizarQuery(l.codigo) === normalizado)),
    );
    if (lineaNueva) {
      // Con variantes no hay una "cantidad" única para sumarle +1 — se
      // reabre el modal para que el usuario ajuste la grilla a mano.
      if (lineaNueva.tieneVariantes) {
        abrirEdicionLineaNueva(lineaNueva);
      } else {
        incrementarLinea(lineaNueva.clienteLineaId);
      }
      setQuery("");
      return;
    }

    // 3. Búsqueda por nombre.
    const candidatos = matchPorNombre(productos, q);
    if (candidatos.length === 0) {
      const esCodigo = pareceCodigo(q);
      setAltaRapida({
        nombrePrefill: esCodigo ? "" : q,
        codigoPrefill: esCodigo ? q : "",
        queryOriginal: normalizado,
        editando: null,
      });
      setQuery("");
      return;
    }
    if (candidatos.length === 1) {
      seleccionarProducto(candidatos[0]);
      setQuery("");
      return;
    }
    setPickerCandidatos(candidatos);
    setQuery("");
  }

  function guardarAltaRapida(
    datos: {
      nombre: string;
      codigo: string;
      marca: string;
      categoriaId: string;
      precioCompra: number;
      precioVenta: number;
      editandoLineaId: string | null;
    } & (
      | { tieneVariantes: false; cantidad: number }
      | {
          tieneVariantes: true;
          opciones: Extract<LineaCargaNueva, { tieneVariantes: true }>["opciones"];
          variantes: Extract<LineaCargaNueva, { tieneVariantes: true }>["variantes"];
        }
    ),
  ) {
    if (!altaRapida) return;
    const base = {
      kind: "NUEVA" as const,
      clienteLineaId: datos.editandoLineaId ?? crypto.randomUUID(),
      queryOriginal: altaRapida.queryOriginal,
      nombre: datos.nombre,
      codigo: datos.codigo.trim() || null,
      marca: datos.marca.trim() || null,
      categoriaId: datos.categoriaId || null,
      precioCompra: datos.precioCompra,
      precioVenta: datos.precioVenta,
    };
    const nueva: LineaCargaNueva = datos.tieneVariantes
      ? {
          ...base,
          tieneVariantes: true,
          opciones: datos.opciones,
          variantes: datos.variantes,
        }
      : { ...base, tieneVariantes: false, cantidad: datos.cantidad };

    setLineas((prev) =>
      datos.editandoLineaId
        ? prev.map((l) => (l.clienteLineaId === datos.editandoLineaId ? nueva : l))
        : [...prev, nueva],
    );
    setAltaRapida(null);
  }

  function updateCantidad(clienteLineaId: string, cantidad: number) {
    if (!Number.isFinite(cantidad) || cantidad <= 0) return;
    setLineas((prev) =>
      prev.map((l) => {
        if (l.clienteLineaId !== clienteLineaId) return l;
        if (l.kind === "NUEVA" && l.tieneVariantes) return l;
        return { ...l, cantidad };
      }),
    );
  }

  function removeLinea(clienteLineaId: string) {
    setLineas((prev) => prev.filter((l) => l.clienteLineaId !== clienteLineaId));
  }

  async function confirmar() {
    if (!lineas.length || isConfirming) return;
    setIsConfirming(true);
    try {
      const res = await confirmarCargaAction(lineas);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const fallidas = res.resultados.filter((r) => !r.ok);
      if (fallidas.length === 0) {
        toast.success(
          `Carga confirmada: ${res.totalOk} línea${res.totalOk === 1 ? "" : "s"} procesada${res.totalOk === 1 ? "" : "s"}.`,
        );
      } else {
        toast.error(
          `${res.totalOk} línea(s) OK, ${res.totalError} fallaron: ${fallidas
            .map((f) => f.error)
            .filter(Boolean)
            .join(" | ")}`,
        );
      }
      setLineas([]);
    } finally {
      setIsConfirming(false);
    }
  }

  return {
    lineas,
    query,
    setQuery,
    procesarEnter,
    pickerCandidatos,
    onCancelarPicker: () => setPickerCandidatos(null),
    onSeleccionarProducto: seleccionarProducto,
    variantSelectorProducto,
    onCerrarVariantSelector: () => setVariantSelectorProducto(null),
    onSeleccionarVariante: (seleccion: {
      varianteId: string | undefined;
      variante: string;
      precio: number | null;
      costo: number | null;
      sku: string | null;
      stockDisponible: number;
    }) => {
      if (!variantSelectorProducto || !seleccion.varianteId) return;
      resolverVariante({
        varianteId: seleccion.varianteId,
        productoId: variantSelectorProducto.id,
        nombreDisplay: seleccion.variante,
        nombreProducto: variantSelectorProducto.nombre,
        sku: seleccion.sku,
        precioCosto: seleccion.costo ?? variantSelectorProducto.precio_costo,
        precioVenta: seleccion.precio ?? variantSelectorProducto.precio,
      });
    },
    altaRapida,
    onCancelarAltaRapida: () => setAltaRapida(null),
    onGuardarAltaRapida: guardarAltaRapida,
    onEditarLineaNueva: abrirEdicionLineaNueva,
    updateCantidad,
    removeLinea,
    confirmar,
    isConfirming,
    inputRef,
    modalAbierto,
    recargoGlobal,
    setRecargoGlobal,
  };
}
