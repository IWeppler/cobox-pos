"use client";

import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Producto } from "@/entities/productos/types";
import type { Rubro } from "@/entities/config/types";
import { useAtajosTeclado } from "@/shared/hooks/use-atajos-teclado";
import { useCargaRapida } from "../hooks/use-carga-rapida";
import { CargaRapidaInput } from "./carga-rapida-input";
import { CargaRapidaPanel, CargaRapidaRecargo } from "./carga-rapida-panel";

interface CargaRapidaPageClientProps {
  productosIniciales: Producto[];
  rubro: Rubro;
}

/**
 * Carga rápida como página (Inventario): trae su propio campo de escaneo y no
 * define contexto de retorno — al confirmar, la lista se vacía y se sigue
 * cargando. La misma capacidad vive dentro del POS como cambio de vista (ver
 * pos-terminal.tsx), consumiendo el mismo hook y el mismo panel.
 */
export function CargaRapidaPageClient({
  productosIniciales,
  rubro,
}: Readonly<CargaRapidaPageClientProps>) {
  const carga = useCargaRapida(productosIniciales, rubro);

  // La misma "f" del POS: acá el campo de escaneo es propio de la página, pero
  // la tecla tiene que ser la misma — quien carga mercadería entra por los dos
  // lados y no puede tener dos teclados distintos para lo mismo.
  useAtajosTeclado([
    { teclas: "f", correr: carga.enfocarBuscador },
    // Misma tecla que en el POS, aunque acá no haya ticket con el que
    // chocar: el atajo es de la Carga rápida, no de la pantalla.
    {
      teclas: "ctrl+Space",
      activo: carga.lineas.length > 0 && !carga.isConfirming,
      correr: carga.confirmar,
    },
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-2 py-2">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Link
          href="/stock"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-sm font-medium text-foreground">
            Carga rápida de mercadería
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escaneá o escribí, Enter agrega a la lista, confirmá todo junto.
          </p>
        </div>

        <div className="ml-auto">
          <CargaRapidaRecargo carga={carga} />
        </div>
      </div>

      <div className="space-y-1.5">
        <CargaRapidaInput
          value={carga.query}
          onChange={carga.setQuery}
          onEnter={carga.procesarEnter}
          // Durante la consulta al maestro el input queda bloqueado: si no,
          // un segundo escaneo de la pickeadora entra mientras vuelve la red
          // y pisa el alta que está por abrirse.
          disabled={carga.modalAbierto || carga.buscandoEnMaestro}
          inputRef={carga.inputRef}
        />
        {carga.buscandoEnMaestro ? (
          <p className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Buscando en el Catálogo Maestro…
          </p>
        ) : null}
      </div>

      <CargaRapidaPanel carga={carga} />
    </div>
  );
}
