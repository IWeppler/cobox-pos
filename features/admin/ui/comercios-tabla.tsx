"use client";

import { ExternalLink } from "lucide-react";
import { AccionesComercioMenu, type PlanOpcion } from "./acciones-comercio-menu";
import { formatearMoneda } from "@/shared/utils/formatters";
import type { ComercioConUso } from "@/features/admin/actions/comercios-con-uso";

const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  suspendido: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  baja: "bg-white/5 text-white/40 border-white/10",
};

/** Barra de consumo de un límite. El track es un paso más claro del mismo
 * color que el fill, no un gris: así el estado se lee a lo largo de toda la
 * barra y no solo en la parte llena. */
function Medidor({
  usado,
  limite,
}: Readonly<{ usado: number; limite: number | null }>) {
  if (limite === null) {
    return (
      <span className="font-mono text-xs tabular-nums text-white/50">
        {usado} <span className="text-white/25">/ ∞</span>
      </span>
    );
  }

  const proporcion = Math.min(1, usado / limite);
  const lleno = usado >= limite;
  const cerca = !lleno && proporcion >= 0.8;

  return (
    <div className="w-24">
      <span
        className={`font-mono text-xs tabular-nums ${
          lleno ? "text-amber-400" : "text-white/60"
        }`}
      >
        {usado} <span className="text-white/25">/ {limite}</span>
      </span>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-primary/15">
        <div
          className={`h-full rounded-full ${
            lleno ? "bg-amber-400" : cerca ? "bg-amber-400/70" : "bg-primary"
          }`}
          style={{ width: `${proporcion * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Los comercios, con sus límites a la vista.
 *
 * Los medidores están acá y no escondidos en un detalle porque son la señal de
 * upgrade: un comercio en 48 de 50 clientes es una conversación pendiente, y si
 * hay que abrir tres pantallas para verlo, no se ve nunca.
 */
export function ComerciosTabla({
  comercios,
  planes,
}: Readonly<{ comercios: ComercioConUso[]; planes: PlanOpcion[] }>) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-3 font-semibold">Comercio</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Vence</th>
              <th className="px-4 py-3 font-semibold">Usuarios</th>
              <th className="px-4 py-3 font-semibold">Cta. corriente</th>
              <th className="px-4 py-3 font-semibold">Productos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {comercios.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white/90">{c.nombre}</span>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        ESTADO_COLOR[c.estado] ?? ESTADO_COLOR.baja
                      }`}
                    >
                      {c.estado}
                    </span>
                  </div>
                  <a
                    href={`https://${c.slug}.comerz.app`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-white/35 hover:text-white/60"
                  >
                    {c.slug}
                    <ExternalLink className="size-2.5" />
                  </a>
                  {c.duenio && (
                    <p className="text-[11px] text-white/25">{c.duenio}</p>
                  )}
                </td>

                <td className="px-4 py-3">
                  <p className="text-white/80">{c.plan_nombre ?? "Sin plan"}</p>
                  {c.plan_precio > 0 && (
                    <p className="font-mono text-[11px] text-white/35 tabular-nums">
                      {formatearMoneda(c.plan_precio)}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3">
                  {c.plan_vencimiento ? (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        c.vencido ? "text-rose-400" : "text-white/60"
                      }`}
                    >
                      {new Date(c.plan_vencimiento).toLocaleDateString("es-AR", {
                        timeZone: "UTC",
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-white/25">—</span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <Medidor usado={c.usuarios} limite={c.maxUsuarios} />
                </td>
                <td className="px-4 py-3">
                  <Medidor
                    usado={c.clientesCuentaCorriente}
                    limite={c.maxClientesCuentaCorriente}
                  />
                </td>
                <td className="px-4 py-3">
                  <Medidor usado={c.productos} limite={c.maxProductos} />
                </td>

                <td className="px-4 py-3 text-right">
                  <AccionesComercioMenu
                    negocioId={c.id}
                    nombre={c.nombre}
                    slug={c.slug}
                    estado={c.estado}
                    planId={c.plan_id}
                    planes={planes}
                  />
                </td>
              </tr>
            ))}

            {comercios.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                  Todavía no hay comercios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
