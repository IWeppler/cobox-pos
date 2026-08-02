"use client";

import { useState, useEffect } from "react";
import {
  Lightbulb,
  X,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Insight } from "@/features/reports/actions/get-advisor-insights";
import Link from "next/link";
import { Button } from "@/shared/ui/button";

interface AdvisorBannerProps {
  insights: Insight[];
}

export function AdvisorBanner({ insights }: Readonly<AdvisorBannerProps>) {
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Envolvemos en setTimeout para evitar el "cascading render" síncrono que detecta el linter
    const timer = setTimeout(() => {
      setMounted(true);
      // 1. Obtenemos la fecha de hoy (Ej: "Tue Jun 09 2026")
      const hoy = new Date().toDateString();

      // 2. Buscamos qué día se cerró por última vez
      const ultimaVezVisto = localStorage.getItem("advisor-banner-last-closed");

      // 3. Si no se cerró hoy, lo mostramos
      if (ultimaVezVisto !== hoy) {
        setIsVisible(true);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    // Cuando lo cierra, guardamos la fecha de hoy para no volver a molestarlo hasta mañana
    const hoy = new Date().toDateString();
    localStorage.setItem("advisor-banner-last-closed", hoy);
    setIsVisible(false);
  };

  // Prevenimos error de hidratación y no mostramos si no es visible
  if (!mounted || !isVisible || insights.length === 0) return null;

  const currentInsight = insights[currentIndex];

  const configMap = {
    danger: {
      bg: "bg-danger/10",
      border: "border-danger/20",
      icon: AlertTriangle,
      iconColor: "text-danger",
      bgIcon: "bg-danger/10",
      titleColor: "text-danger ",
      msgColor: "text-danger/90",
      btnClass: "bg-danger text-white",
    },
    warning: {
      bg: "bg-warning/10",
      border: "border-warning/20",
      icon: AlertTriangle,
      iconColor: "text-warning",
      bgIcon: "bg-warning/10",
      titleColor: "text-warning",
      msgColor: "text-warning/90",
      btnClass: "bg-warning text-white",
    },
    success: {
      bg: "bg-success/10",
      border: "border-success/20",
      icon: TrendingUp,
      iconColor: "text-success",
      bgIcon: "bg-success/10",
      titleColor: "text-success",
      msgColor: "text-success",
      btnClass: "bg-success text-white",
    },
    info: {
      bg: "bg-info/10",
      border: "border-info/20",
      icon: Lightbulb,
      iconColor: "text-info",
      bgIcon: "bg-info/10",
      titleColor: "text-info",
      msgColor: "text-info",
      btnClass: "bg-info hover:bg-info text-white",
    },
  };

  const config = configMap[currentInsight.type];
  const Icon = config.icon;

  return (
    <div
      className={`relative ${config.bg} border ${config.border} p-5 md:p-6 rounded-2xl flex flex-col sm:flex-row items-start gap-4 transition-all duration-300`}
    >
      {/* Botón Cerrar */}
      <button
        onClick={handleClose}
        className="absolute top-3 right-3 p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground rounded-md transition-colors cursor-pointer z-10"
        aria-label="Cerrar sugerencias"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Ícono Izquierdo (Oculto en móvil) */}
      <div
        className={`p-2.5 ${config.bgIcon} ${config.iconColor} rounded-xl shrink-0 hidden sm:block`}
      >
        <Icon className="w-6 h-6" />
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 w-full flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="pr-6 sm:pr-0">
          {/* Título e Ícono Móvil */}
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className={`p-1.5 ${config.bgIcon} ${config.iconColor} rounded-md sm:hidden`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <h4 className={`font-semibold ${config.titleColor} text-md`}>
              Recomendaciones inteligentes
            </h4>
            <span
              className={`text-[10px] uppercase font-semibold ${config.bgIcon} ${config.titleColor} px-2 py-0.5 rounded-md tracking-wider border ${config.border}`}
            >
              {currentInsight.title}
            </span>
          </div>

          <p
            className={`${config.msgColor} text-sm md:text-base leading-relaxed`}
          >
            {currentInsight.message}
          </p>
        </div>

        {/* Botón de Acción (Call To Action) */}
        {currentInsight.actionLabel && currentInsight.href && (
          <Link
            href={currentInsight.href}
            className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0"
          >
            <Button
              size="sm"
              className={`w-full sm:w-auto font-bold ${config.btnClass} shadow-none`}
            >
              {currentInsight.actionLabel}{" "}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        )}
      </div>

      {/* Navegación tipo Carrusel (Si hay > 1 consejo) */}
      {insights.length > 1 && (
        <div className="absolute bottom-3 right-0 left-0 flex justify-center gap-1.5 pointer-events-none">
          {insights.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`w-2 h-2 rounded-full transition-all cursor-pointer pointer-events-auto ${
                idx === currentIndex
                  ? config.iconColor.replace("text-", "bg-")
                  : "bg-black/10 hover:bg-black/20"
              }`}
              aria-label={`Ver consejo ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
