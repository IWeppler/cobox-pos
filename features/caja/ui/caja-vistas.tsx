"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { LayoutDashboard, Wallet } from "lucide-react";

type Vista = "mi-turno" | "general";

interface CajaVistasProps {
  /** Flujo de cajera: apertura, movimientos del turno y cierre. */
  miTurno: ReactNode;
  /** Vista Gerencial. Ausente = el usuario no tiene caja.ver_gerencial. */
  general?: ReactNode;
  /** false para la dueña que nunca abre caja: no se le ofrece "Mi turno" y
   * la página arranca (y se queda) en la Vista Gerencial. Siempre puede abrir
   * un turno desde el botón de caja del navbar si algún día le toca atender. */
  esCajera: boolean;
  /** Con turno propio abierto la página arranca en "Mi turno": es lo que
   * necesita resolver ya. Sin turno, arranca en la vista general. */
  vistaInicial: Vista;
}

/**
 * Decide qué es el contenido principal de /caja según lo que la persona hace
 * en el local, no según su rol:
 *
 * - solo cajera  -> su turno, sin toggle
 * - solo gerencia -> Vista Gerencial, sin toggle ni nada de turnos
 * - las dos (Evelyn) -> toggle
 */
export function CajaVistas({
  miTurno,
  general,
  esCajera,
  vistaInicial,
}: Readonly<CajaVistasProps>) {
  const [vista, setVista] = useState<Vista>(vistaInicial);

  const hayToggle = esCajera && Boolean(general);

  if (!hayToggle) {
    // Sin toggle, manda lo que la persona puede hacer: si no es cajera y tiene
    // permiso, la vista general; en cualquier otro caso, su turno.
    return <>{!esCajera && general ? general : miTurno}</>;
  }

  const opciones: { valor: Vista; label: string; Icono: typeof Wallet }[] = [
    { valor: "mi-turno", label: "Mi turno", Icono: Wallet },
    { valor: "general", label: "Vista general", Icono: LayoutDashboard },
  ];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Vista de caja"
        className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted p-1"
      >
        {opciones.map(({ valor, label, Icono }) => {
          const activa = vista === valor;
          return (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setVista(valor)}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                activa
                  ? "bg-background text-foreground shadow-none border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icono className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Se monta solo la vista activa. Las dos traen sus propias tablas y
          formularios; tenerlas ocultas con CSS duplicaría estado sin motivo. */}
      {vista === "mi-turno" ? miTurno : general}
    </div>
  );
}
