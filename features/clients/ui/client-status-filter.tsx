"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

export type ClientStatusFilter = "todos" | "al_dia" | "con_deuda" | "vencido";

const OPTIONS: {
  value: ClientStatusFilter;
  label: string;
  activeClassName: string;
  hoverClassName: string;
}[] = [
  {
    value: "todos",
    label: "Todos",
    activeClassName: "bg-background text-foreground",
    hoverClassName: "hover:text-foreground",
  },
  {
    value: "al_dia",
    label: "Al día",
    activeClassName: "bg-background text-emerald-600 dark:text-accent-lime",
    hoverClassName: "hover:text-emerald-600 dark:hover:text-accent-lime",
  },
  {
    value: "con_deuda",
    label: "Con deuda",
    activeClassName: "bg-background text-accent-orange",
    hoverClassName: "hover:text-accent-orange",
  },
  {
    value: "vencido",
    label: "Vencido",
    activeClassName: "bg-background text-rose-600 dark:text-rose-400",
    hoverClassName: "hover:text-rose-600 dark:hover:text-rose-400",
  },
];

interface ClientStatusFilterControlProps {
  value: ClientStatusFilter;
  onChange: (value: ClientStatusFilter) => void;
}

export function ClientStatusFilterControl({
  value,
  onChange,
}: Readonly<ClientStatusFilterControlProps>) {
  return (
    <>
      {/* Desktop/tablet: segmented control */}
      <div className="hidden sm:grid sm:grid-cols-4 sm:gap-1 sm:bg-muted sm:p-1 sm:rounded-xl sm:border sm:border-border/50 sm:w-auto sm:items-center">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              value === option.value
                ? option.activeClassName
                : `text-muted-foreground ${option.hoverClassName}`
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Mobile: select nativo (4 opciones no entran cómodas en tabs) */}
      <div className="sm:hidden w-full">
        <Select
          value={value}
          onValueChange={(next) => onChange(next as ClientStatusFilter)}
        >
          <SelectTrigger className="h-10 w-full bg-muted border border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
