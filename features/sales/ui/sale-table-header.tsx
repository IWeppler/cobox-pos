import { ReactNode } from "react";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Search, ArrowUpDown } from "lucide-react";

export interface SaleTableHeaderOption {
  value: string;
  label: string;
}

interface SaleTableHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  orderValue: string;
  onOrderChange: (value: string) => void;
  orderOptions: SaleTableHeaderOption[];
  actions?: ReactNode;
}

export function SaleTableHeader({
  searchValue,
  onSearchChange,
  orderValue,
  onOrderChange,
  orderOptions,
}: Readonly<SaleTableHeaderProps>) {
  return (
    <div className="flex flex-row gap-2 sm:gap-3 items-center bg-card p-2 sm:p-3 rounded-xl border border-border">
      {/* 1. Buscador (Toma todo el espacio disponible) */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
        <Input
          placeholder="Buscar por producto o #recibo..."
          className="pl-9 sm:pl-10 h-10 text-xs sm:text-sm rounded-lg border-border/60 bg-muted focus-visible:bg-background shadow-none transition-colors w-full"
          value={searchValue}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
        />
      </div>

      {/* 2. Filtro (Cuadrado en móviles, Desplegable completo en PC) */}
      <div className="shrink-0">
        <Select value={orderValue} onValueChange={onOrderChange}>
          {/* Usamos [&>svg]:hidden en móviles para ocultar la flecha por defecto de shadcn y mostrar nuestro ícono */}
          <SelectTrigger className="h-10 w-10 sm:w-44 border-border/60 bg-white shadow-none font-medium px-0 sm:px-3 flex items-center justify-center sm:justify-between [&>svg]:hidden sm:[&>svg]:block">
            <span className="hidden sm:inline-flex truncate">
              <SelectValue placeholder="Ordenar por..." />
            </span>
            <div className="flex sm:hidden items-center justify-center">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {orderOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
