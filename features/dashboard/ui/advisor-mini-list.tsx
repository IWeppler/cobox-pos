import Link from "next/link";
import { Lightbulb, AlertTriangle, TrendingUp } from "lucide-react";
import type { Insight } from "@/features/reports/actions/get-advisor-insights";

interface AdvisorMiniListProps {
  insights: Insight[];
}

const ICONO_POR_TIPO: Record<Insight["type"], typeof Lightbulb> = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  success: TrendingUp,
  info: Lightbulb,
};

const COLOR_POR_TIPO: Record<Insight["type"], string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
};

/**
 * Presentación del Advisor para el dashboard — mismo dato que
 * advisor-banner.tsx (getAdvisorInsights, sin tocar su motor de reglas)
 * pero SIN carrusel, sin botón de cierre, sin persistencia en localStorage:
 * lista estática de hasta 3 líneas, siempre visible. advisor-banner.tsx
 * sigue intacto para /reportes — son dos superficies distintas del mismo
 * array de insights.
 */
export function AdvisorMiniList({ insights }: Readonly<AdvisorMiniListProps>) {
  return (
    <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Cobox Insights
        </span>
      </div>

      {insights.length > 0 ? (
        <div className="divide-y divide-border overflow-y-auto">
          {insights.slice(0, 3).map((insight) => {
            const Icon = ICONO_POR_TIPO[insight.type];
            const color = COLOR_POR_TIPO[insight.type];
            const contenido = (
              <div className="flex items-start gap-2.5 px-4 py-3">
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {insight.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {insight.message}
                  </p>
                </div>
              </div>
            );

            return insight.href ? (
              <Link
                key={insight.id}
                href={insight.href}
                className="block hover:bg-muted/30 transition-colors"
              >
                {contenido}
              </Link>
            ) : (
              <div key={insight.id}>{contenido}</div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-muted-foreground italic text-center">
            Sin recomendaciones por ahora.
          </p>
        </div>
      )}
    </div>
  );
}
