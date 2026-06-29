"use client";

import { useState } from "react";
import { ConfiguracionPOS } from "@/entities/config/types";
import {
  Store,
  Globe,
  Tag,
  Receipt,
  Users,
  CreditCard,
  Settings,
  FileSliders,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ConfigForm } from "./config-form";
import { PromotionsPanel } from "@/features/promotions/ui/promotions-panel";
import { PreferencesPanel } from "@/features/preferences/ui/preferences-panel";
import { PaymentsPanel } from "@/features/payments/ui/payments-panel";
import { CatalogPanel } from "@/features/catalog/ui/catalog-panel";
import { CategoriesPanel } from "@/features/categories/ui/categories-panel";
import { ClientsPanel } from "@/features/clients/ui/clients-panel";

const SECTIONS = [
  {
    id: "comercio",
    label: "Comercio",
    icon: Store,
    description: "Datos básicos, logo y horarios",
  },
  {
    id: "catalogo",
    label: "Catálogo Online",
    icon: Globe,
    description: "Link público y preferencias",
  },
  {
    id: "categoria",
    label: "Categorías",
    icon: FileSliders,
    description: "Categorías y organización del catálogo",
  },
  {
    id: "promociones",
    label: "Promociones",
    icon: Tag,
    description: "Descuentos y reglas comerciales",
  },
  {
    id: "pagos",
    label: "Métodos de Pago",
    icon: CreditCard,
    description: "Efectivo, transferencias, recargos",
  },
  {
    id: "ticket",
    label: "Ticket de Venta",
    icon: Receipt,
    description: "Mensajes y formato del recibo",
  },
  {
    id: "empleados",
    label: "Empleados y Permisos",
    icon: Users,
    description: "Cajeros, administradores y roles",
  },
  {
    id: "clientes",
    label: "Clientes",
    icon: Users,
    description: "Cajeros, administradores y roles",
  },
  {
    id: "preferencias",
    label: "Preferencias",
    icon: Settings,
    description: "Moneda, zona horaria, colores",
  },
];

interface SettingsManagerProps {
  config: ConfiguracionPOS;
  promociones: any[];
  pagos: any[];
  categorias?: any[];
}

export function SettingsManager({
  config,
  promociones,
  pagos,
  categorias,
}: Readonly<SettingsManagerProps>) {
  const [activeSection, setActiveSection] = useState("comercio");

  const renderPanel = () => {
    switch (activeSection) {
      case "comercio":
        return <ConfigForm config={config} />;
      case "categoria":
        return <CategoriesPanel categorias={categorias || []} />;
      case "promociones":
        return <PromotionsPanel promociones={promociones} />;
      case "preferencias":
        return <PreferencesPanel />;
      case "pagos":
        return <PaymentsPanel pagos={pagos} />;
      case "catalogo":
        return <CatalogPanel config={config} />;
      case "clientes":
        return <ClientsPanel config={config} />;
      default:
        return (
          <div className="bg-card text-card-foreground p-6 rounded-2xl border border-border flex flex-col items-center justify-center py-24 text-center">
            <Settings className="w-16 h-16 text-muted-foreground/20 mb-4 animate-spin-slow" />
            <h2 className="text-xl font-bold">En construcción</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Esta sección estará disponible próximamente.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
      {/* SIDEBAR DE NAVEGACIÓN */}
      <aside className="w-full md:w-64 shrink-0">
        {/* Selector Mobile (Se oculta en Desktop) */}
        <div className="md:hidden mb-4">
          <Select value={activeSection} onValueChange={setActiveSection}>
            <SelectTrigger className="w-full h-12 bg-background border-border rounded-xl font-medium">
              <SelectValue placeholder="Seleccionar sección" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {SECTIONS.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  <div className="flex items-center gap-2">
                    <section.icon className="w-4 h-4 text-muted-foreground" />
                    {section.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Menú Lateral Desktop */}
        <nav className="hidden md:flex flex-col gap-1.5 sticky top-24">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;

            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-start gap-3 p-3 rounded-xl transition-all text-left w-full cursor-pointer ${
                  isActive
                    ? "bg-card text-foreground border border-border font-semibold"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent font-medium"
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 mt-0.5 ${isActive ? "text-primary" : "opacity-70"}`}
                />
                <div>
                  <p className="text-sm">{section.label}</p>
                  {isActive && (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 animate-in fade-in slide-in-from-top-1">
                      {section.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 min-w-0 animate-in fade-in-50 duration-300">
        {renderPanel()}
      </main>
    </div>
  );
}
