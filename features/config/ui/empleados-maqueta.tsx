/**
 * Maqueta decorativa de Equipo y permisos, para el fondo del paywall.
 *
 * Mismo criterio que ReportesMaqueta: el velo del modal es CSS y se saca desde
 * las DevTools, así que detrás de un módulo bloqueado no puede haber datos
 * reales. Acá no hay nombres, ni mails, ni roles del comercio — formas grises
 * con la silueta de la sección y nada más.
 */
export function EmpleadosMaqueta() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-4 flex flex-col gap-3">
          {["e1", "e2", "e3"].map((k) => (
            <div key={k} className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-40 rounded bg-muted" />
                <div className="h-2 w-56 rounded bg-muted/60" />
              </div>
              <div className="h-7 w-24 rounded-lg bg-muted/70" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="h-10 flex-1 rounded-lg bg-muted/70" />
          <div className="h-10 w-48 rounded-lg bg-muted/70" />
          <div className="h-10 w-24 rounded-lg bg-muted" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="h-4 w-36 rounded bg-muted" />
        <div className="mt-4 space-y-2">
          {["p1", "p2", "p3", "p4", "p5"].map((k) => (
            <div key={k} className="flex items-center gap-3">
              <div className="h-2.5 flex-1 rounded bg-muted/60" />
              {["a", "b", "c"].map((c) => (
                <div key={c} className="size-4 rounded bg-muted" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
