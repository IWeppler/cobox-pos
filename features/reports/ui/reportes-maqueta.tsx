/**
 * Maqueta decorativa de Reportes, para el fondo difuminado del paywall.
 *
 * No recibe props ni consulta nada, y eso es el punto: el blur es CSS y se
 * quita desde las DevTools, así que el fondo de un módulo bloqueado no puede
 * ser el módulo de verdad. Acá no hay un solo dato del comercio — son formas
 * grises que, a 6px de desenfoque, dicen "hay un tablero detrás" y nada más.
 *
 * Por la misma razón no muestra números inventados: a nadie le sirve leer
 * "$4.200.000" y no saber si es suyo.
 */
export function ReportesMaqueta() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-hidden>
      <div className="flex items-center justify-between">
        <div className="h-6 w-40 rounded-md bg-muted" />
        <div className="h-8 w-56 rounded-lg bg-muted" />
      </div>

      <div className="flex gap-2">
        {["a", "b", "c", "d", "e"].map((k) => (
          <div key={k} className="h-8 w-28 rounded-lg bg-muted/70" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["k1", "k2", "k3", "k4"].map((k) => (
          <div
            key={k}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
          >
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-7 w-28 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted/60" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="h-3 w-32 rounded bg-muted" />
          {/* Barras de alturas fijas: un gráfico reconocible sin datos. */}
          <div className="mt-4 flex h-40 items-end gap-2">
            {[45, 70, 35, 85, 60, 95, 50, 75, 40, 80, 55, 65].map((alto, i) => (
              <div
                key={`${alto}-${i}`}
                className="flex-1 rounded-t bg-primary/30"
                style={{ height: `${alto}%` }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="h-3 w-24 rounded bg-muted" />
          {["r1", "r2", "r3", "r4", "r5"].map((k) => (
            <div key={k} className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-3/4 rounded bg-muted" />
                <div className="h-2 w-1/2 rounded bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
