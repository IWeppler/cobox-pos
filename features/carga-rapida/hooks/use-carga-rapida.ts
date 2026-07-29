"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Producto } from "@/entities/productos/types";
import type { Rubro } from "@/entities/config/types";
import { matchPorNombre, matchSkuExacto, normalizarQuery } from "../lib/matching";
import { prefillAVariantes } from "../lib/maestro-prefill";
import { confirmarCargaAction } from "../actions/confirmar-carga";
import {
  buscarEnCatalogoMaestroAction,
  buscarEnCatalogoMaestroPorNombreAction,
  obtenerPrefillMaestroAction,
} from "../actions/buscar-en-maestro";
import type { CandidatoMaestro, PrefillMaestro } from "../lib/maestro-prefill";
import type { LineaCarga, LineaCargaExistente, LineaCargaNueva } from "../types";

type AltaRapidaPendiente = {
  nombrePrefill: string;
  codigoPrefill: string;
  queryOriginal: string;
  editando: LineaCargaNueva | null;
  /** No-null cuando el EAN escaneado matcheó en el Catálogo Maestro: el
   * modal arranca con nombre/marca/modelo/atributos ya cargados y el
   * empleado solo confirma cantidad y precio. */
  maestro: PrefillMaestro | null;
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

export function useCargaRapida(productos: Producto[], rubro: Rubro) {
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
  const [buscandoEnMaestro, setBuscandoEnMaestro] = useState(false);
  // Candidatos del maestro esperando que el empleado elija uno. Se guarda
  // también el texto que los originó: sin eso, al elegir un candidato no se
  // sabe con qué query dedupear la línea nueva.
  const [maestroCandidatos, setMaestroCandidatos] = useState<{
    lista: CandidatoMaestro[];
    query: string;
    queryNormalizada: string;
  } | null>(null);
  const [resolviendoCandidato, setResolviendoCandidato] = useState<
    string | null
  >(null);
  const [recargoGlobal, setRecargoGlobal] = useState<number | "">("");

  const inputRef = useRef<HTMLInputElement>(null);

  const modalAbierto =
    pickerCandidatos !== null ||
    variantSelectorProducto !== null ||
    altaRapida !== null ||
    maestroCandidatos !== null;

  // El input se deshabilita mientras hay un modal abierto o mientras vuelve la
  // consulta al maestro, y un input deshabilitado pierde el foco. Hay que
  // devolvérselo apenas se rehabilita por CUALQUIERA de las dos causas: si
  // esto solo mira `modalAbierto`, cada búsqueda en el maestro deja el foco
  // perdido y obliga a clickear antes de escanear la caja siguiente.
  useEffect(() => {
    if (!modalAbierto && !buscandoEnMaestro) inputRef.current?.focus();
  }, [modalAbierto, buscandoEnMaestro]);

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
        if (l.kind === "NUEVA" && l.tieneVariantes) {
          // Reescanear la misma caja suma una unidad a la variante fija, que
          // es lo que espera quien está pasando la pickeadora por un pallet.
          if (!l.varianteFijaLabel) return l;
          return {
            ...l,
            variantes: l.variantes.map((v, i) =>
              i === 0
                ? { ...v, stock: String((Number.parseInt(v.stock, 10) || 0) + 1) }
                : v,
            ),
          };
        }
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
      // Al reeditar, los datos del maestro ya están copiados en la línea —
      // no se vuelve a consultar.
      maestro: null,
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

  /**
   * Agrega la línea directo, sin pasar por el modal de combinaciones.
   *
   * Solo para match del maestro en electro: una fila del maestro ES una
   * combinación concreta (128GB / Black) con su propio EAN, así que la
   * variante ya está resuelta y la matriz no aporta nada. El empleado
   * completa precio y cantidad inline en la lista.
   *
   * Precios en 0 a propósito: el maestro no tiene precios y no debe
   * inventarlos. La línea queda visiblemente incompleta hasta que los carga.
   */
  function agregarLineaDesdeMaestro(
    prefill: PrefillMaestro,
    queryNormalizada: string,
  ) {
    const { opciones, variantes } = prefillAVariantes(prefill);

    const base = {
      kind: "NUEVA" as const,
      clienteLineaId: crypto.randomUUID(),
      queryOriginal: queryNormalizada,
      nombre: prefill.nombre,
      codigo: prefill.ean || null,
      marca: prefill.marca,
      modelo: prefill.modelo,
      categoriaId: prefill.categoriaId,
      precioCompra: 0,
      precioVenta: 0,
      idMaster: prefill.idMaster,
    };

    // Sin atributos en el maestro no hay combinación que congelar: es un
    // producto simple y sigue el camino de cantidad a nivel línea.
    const nueva: LineaCargaNueva =
      opciones.length > 0 && variantes.length > 0
        ? {
            ...base,
            tieneVariantes: true,
            opciones,
            variantes,
            varianteFijaLabel: Object.values(prefill.atributos).join(" / "),
          }
        : { ...base, tieneVariantes: false, cantidad: 1 };

    setLineas((prev) => [...prev, nueva]);
  }

  /** "Ninguno de estos": sigue al alta manual con lo que ya venía tipeado, sin
   * perder el texto. También es el camino de salida si resolver el candidato
   * falla. */
  function abrirAltaManualDesdeMaestro() {
    setMaestroCandidatos((actual) => {
      if (!actual) return null;
      const esCodigo = pareceCodigo(actual.query);
      setAltaRapida({
        nombrePrefill: esCodigo ? "" : actual.query,
        codigoPrefill: esCodigo ? actual.query : "",
        queryOriginal: actual.queryNormalizada,
        editando: null,
        maestro: null,
      });
      return null;
    });
  }

  async function elegirCandidatoMaestro(candidato: CandidatoMaestro) {
    if (!maestroCandidatos || resolviendoCandidato) return;

    setResolviendoCandidato(candidato.idMaster);
    try {
      const prefill = await obtenerPrefillMaestroAction(candidato.idMaster);

      if (!prefill) {
        toast.error(
          "No se pudo traer ese producto del Catálogo Maestro. Cargalo a mano.",
        );
        abrirAltaManualDesdeMaestro();
        return;
      }

      // Igual que el match por EAN: la variante ya vino resuelta del maestro,
      // así que la línea entra directo a la lista sin modal de combinaciones.
      agregarLineaDesdeMaestro(prefill, maestroCandidatos.queryNormalizada);
      setMaestroCandidatos(null);
    } finally {
      setResolviendoCandidato(null);
    }
  }

  async function procesarEnter(rawQuery: string) {
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
      // reabre el modal para que el usuario ajuste la grilla a mano. Salvo
      // que la variante venga fija del maestro: ahí sí hay una sola y suma.
      if (lineaNueva.tieneVariantes && !lineaNueva.varianteFijaLabel) {
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

      // 4. Último recurso antes del alta manual: si parece un código, se
      // consulta el Catálogo Maestro (otro proyecto, solo lectura). Solo
      // para códigos — buscar un nombre tipeado ahí no tendría sentido, el
      // maestro se indexa por EAN — y solo en electro: el maestro no tiene
      // nada que decir sobre una remera, así que en indumentaria ni se
      // intenta (la action lo rechaza igual; esto evita el viaje y el
      // spinner de "Buscando en el Catálogo Maestro…").
      //
      // La query se limpia ANTES del await para que la pickeadora no quede
      // acumulando el próximo escaneo sobre el texto viejo mientras vuelve
      // la red.
      setQuery("");

      let maestro: PrefillMaestro | null = null;
      if (rubro === "electro") {
        setBuscandoEnMaestro(true);
        try {
          // Si parece un código se prueba primero el EAN exacto, que es el
          // camino barato y sin ambigüedad.
          if (esCodigo) {
            maestro = await buscarEnCatalogoMaestroAction(q);
          }

          // Si el EAN no resolvió, se busca por texto. Esto cubre los dos
          // agujeros reales: los productos del maestro sin ean_gtin cargado, y
          // el empleado que tipea el nombre en vez de escanear. Ojo que
          // pareceCodigo() marca "moto" como código (no tiene espacios), así
          // que sin este fallback tipear una sola palabra no encontraba nada.
          if (!maestro) {
            const candidatos =
              await buscarEnCatalogoMaestroPorNombreAction(q);
            if (candidatos.length > 0) {
              setMaestroCandidatos({
                lista: candidatos,
                query: q,
                queryNormalizada: normalizado,
              });
              return;
            }
          }
        } finally {
          setBuscandoEnMaestro(false);
        }
      }

      // Con match del maestro la variante ya está resuelta: línea directo a la
      // lista. Sin match, el alta manual de siempre abre el modal.
      if (maestro) {
        agregarLineaDesdeMaestro(maestro, normalizado);
        return;
      }

      setAltaRapida({
        nombrePrefill: esCodigo ? "" : q,
        codigoPrefill: esCodigo ? q : "",
        queryOriginal: normalizado,
        editando: null,
        maestro: null,
      });
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
      modelo: string;
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
      modelo: datos.modelo.trim() || null,
      categoriaId: datos.categoriaId || null,
      precioCompra: datos.precioCompra,
      precioVenta: datos.precioVenta,
      // Se preserva al reeditar una línea que ya venía del maestro.
      idMaster: altaRapida.maestro?.idMaster ?? altaRapida.editando?.idMaster ?? null,
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
    // Se acepta 0 para que el campo inline se pueda vaciar y retipear; la
    // línea queda marcada como incompleta y `confirmar` la frena.
    if (!Number.isFinite(cantidad) || cantidad < 0) return;
    setLineas((prev) =>
      prev.map((l) => {
        if (l.clienteLineaId !== clienteLineaId) return l;
        if (l.kind === "NUEVA" && l.tieneVariantes) {
          // Con variante fija del maestro hay UNA sola combinación, así que la
          // cantidad de la línea es su stock. Sin variante fija (matriz armada
          // a mano) no existe una cantidad única: se edita en el modal.
          if (!l.varianteFijaLabel) return l;
          return {
            ...l,
            variantes: l.variantes.map((v, i) =>
              i === 0 ? { ...v, stock: String(cantidad) } : v,
            ),
          };
        }
        // Líneas simples y EXISTENTE: no bajan de 1. Una línea de 0 unidades
        // no significa nada — para eso está el botón de quitar.
        if (cantidad <= 0) return l;
        return { ...l, cantidad };
      }),
    );
  }

  /** Edición inline de precios en la lista, para las líneas de variante fija:
   * el maestro no trae precios, así que se cargan acá en vez de en el modal. */
  function updatePrecioLinea(
    clienteLineaId: string,
    campo: "precioCompra" | "precioVenta",
    valor: number,
  ) {
    if (!Number.isFinite(valor) || valor < 0) return;
    setLineas((prev) =>
      prev.map((l) =>
        l.clienteLineaId === clienteLineaId && l.kind === "NUEVA"
          ? { ...l, [campo]: valor }
          : l,
      ),
    );
  }

  function removeLinea(clienteLineaId: string) {
    setLineas((prev) => prev.filter((l) => l.clienteLineaId !== clienteLineaId));
  }

  async function confirmar() {
    if (!lineas.length || isConfirming) return;

    // Las líneas de variante fija se completan inline, así que pueden llegar
    // acá sin precio o sin cantidad. Se frena en el cliente para poder decir
    // CUÁL falta: la validación del server devuelve un error global que no
    // identifica la línea.
    const incompleta = lineas.find(
      (l) =>
        l.kind === "NUEVA" &&
        l.tieneVariantes &&
        l.varianteFijaLabel &&
        (l.precioCompra <= 0 ||
          l.precioVenta <= 0 ||
          (Number.parseInt(l.variantes[0]?.stock ?? "0", 10) || 0) <= 0),
    );
    if (incompleta && incompleta.kind === "NUEVA") {
      toast.error(
        `Completá costo, venta y cantidad de "${incompleta.nombre}" antes de confirmar.`,
      );
      return;
    }

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
    maestroCandidatos,
    onElegirCandidatoMaestro: elegirCandidatoMaestro,
    onCargarManualDesdeMaestro: abrirAltaManualDesdeMaestro,
    resolviendoCandidato,
    altaRapida,
    onCancelarAltaRapida: () => setAltaRapida(null),
    onGuardarAltaRapida: guardarAltaRapida,
    onEditarLineaNueva: abrirEdicionLineaNueva,
    updateCantidad,
    updatePrecioLinea,
    removeLinea,
    confirmar,
    isConfirming,
    buscandoEnMaestro,
    inputRef,
    modalAbierto,
    recargoGlobal,
    setRecargoGlobal,
  };
}
