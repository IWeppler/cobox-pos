import { ArrowDownRight, ArrowUpRight, Check } from "lucide-react";
import type { PlanCompleto } from "@/features/admin/actions/planes-actions";
import type { Modalidad, ReglasPlan } from "@/shared/lib/planes";
import { NOMBRE_FEATURE, precioMensualEfectivo } from "@/shared/lib/planes";
import { featuresExtra, relacionConPlanActual } from "@/shared/lib/suscripcion";
import { formatearMoneda } from "@/shared/utils/formatters";

/**
 * "¿Querés cambiar de plan?" — comparativa compacta, no una landing de precios.
 *
 * Los precios y las features salen de `planes` (tabla), nunca hardcodeados.
 * De cada plan distinto al actual se muestra sólo lo que CAMBIA respecto del
 * que ya se tiene: repetir las 14 features que ya tenés no ayuda a decidir.
 *
 * El botón no dice "Mejorar"/"Upgrade" fijo: la relación se calcula por
 * `orden`, así que un plan más chico se ofrece como "Cambiar a este plan" y no
 * como si fuera una mejora.
 */
export function OtrosPlanesSeccion({
  planes,
  planActualNombre,
  ordenActual,
  reglasActuales,
  modalidad,
}: {
  planes: PlanCompleto[];
  planActualNombre: string | null;
  ordenActual: number | null;
  reglasActuales: ReglasPlan | null;
  modalidad: Modalidad;
}) {
  if (planes.length === 0) return null;

  return (
    <section aria-labelledby="otros-planes-titulo" className="space-y-4">
      <div>
        <h3
          id="otros-planes-titulo"
          className="text-sm font-semibold text-foreground"
        >
          {planActualNombre ? "¿Querés cambiar de plan?" : "Planes disponibles"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Precios por mes
          {modalidad === "semestral" ? ", con el descuento semestral aplicado" : ""}
          .
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {planes.map((plan) => {
          const relacion = relacionConPlanActual(ordenActual, plan.orden);
          const esActual = relacion === "actual";
          const extras = esActual
            ? []
            : featuresExtra(reglasActuales, plan.reglas);

          return (
            <li
              key={plan.id}
              className={`flex flex-col rounded-xl border p-5 ${
                esActual
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-foreground">{plan.nombre}</h4>
                {esActual && (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Tu plan
                  </span>
                )}
              </div>

              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                {formatearMoneda(
                  precioMensualEfectivo(plan.precio_mensual, modalidad),
                )}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / mes
                </span>
              </p>

              {plan.descripcion && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {plan.descripcion}
                </p>
              )}

              {extras.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-foreground">
                    {relacion === "superior" ? "Suma:" : "Respecto de tu plan:"}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {extras.slice(0, 4).map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500"
                          aria-hidden="true"
                        />
                        <span>{NOMBRE_FEATURE[f] ?? f}</span>
                      </li>
                    ))}
                    {extras.length > 4 && (
                      <li className="text-xs text-muted-foreground">
                        y {extras.length - 4} más
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {!esActual && relacion === "inferior" && (
                <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                  <ArrowDownRight
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    Es un plan más chico: revisá los límites antes de cambiar.
                  </span>
                </p>
              )}

              {!esActual && relacion === "superior" && planActualNombre && (
                <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                  <ArrowUpRight
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Más funcionalidades y límites más altos.</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
