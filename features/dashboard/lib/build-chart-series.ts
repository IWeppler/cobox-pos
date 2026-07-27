import { Venta } from "@/entities/ventas/types";

export type PuntoSerieDiaria = {
  fecha: string; // ISO yyyy-mm-dd
  ingresos: number;
  unidades: number;
  ganancia: number;
};

/**
 * Serie diaria para el area chart del panel — ventana fija de `dias` días
 * terminando en `ahora`, independiente del selector de período (Hoy/Semana/
 * Mes gobierna el número héroe y los rankings, no esta ventana). Días sin
 * ventas quedan en 0, no se saltean — el chart necesita continuidad.
 */
export function construirSerieDiaria(
  ventasOperativas: Venta[],
  dias: number,
  ahora: Date,
): PuntoSerieDiaria[] {
  const puntos = new Map<string, PuntoSerieDiaria>();

  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate() - i,
    );
    const key = isoDate(d);
    puntos.set(key, { fecha: key, ingresos: 0, unidades: 0, ganancia: 0 });
  }

  const inicioVentana = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate() - (dias - 1),
  );

  for (const v of ventasOperativas) {
    const f = new Date(v.fecha_venta);
    if (f < inicioVentana) continue;

    const key = isoDate(f);
    const punto = puntos.get(key);
    if (!punto) continue;

    const total = Number(v.total || 0);
    const costo = Number(v.precio_costo || 0);

    punto.ingresos += total;
    punto.ganancia += total - costo;
    punto.unidades += Number(v.cantidad || 0);
  }

  return Array.from(puntos.values());
}

function isoDate(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const d = fecha.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
