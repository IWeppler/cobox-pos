"use client";

import { useState, type ChangeEvent } from "react";
import { format, isValid, parse, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Calendar } from "@/shared/ui/calendar";
import { cn } from "@/lib/utils";

const FORMATO_VISIBLE = "dd/MM/yyyy";
const FORMATO_ISO = "yyyy-MM-dd";

interface DatePickerARProps {
  id?: string;
  /** Si se pasa, además del picker se renderiza un <input type="hidden">
   * con este name — así formularios no controlados que leen FormData en
   * el submit (ej. edit-client-modal.tsx) siguen funcionando sin pasar a
   * estado controlado. */
  name?: string;
  /** ISO "YYYY-MM-DD". Si se pasa, el componente es controlado (requiere
   * onChange). Si no, es no controlado — usa defaultValue + name. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  /** ISO "YYYY-MM-DD" */
  max?: string;
  min?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

function aFecha(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const fecha = parseISO(iso);
  return isValid(fecha) ? fecha : undefined;
}

function aTextoVisible(iso: string | null | undefined): string {
  const fecha = aFecha(iso);
  return fecha ? format(fecha, FORMATO_VISIBLE) : "";
}

/** Enmascara dígitos sueltos en DD/MM/AAAA a medida que se tipea, sin
 * depender de cómo el navegador interprete el orden — el orden lo define
 * este componente, no el locale del sistema operativo. */
function enmascarar(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 8);
  if (digitos.length > 4) {
    return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
  }
  if (digitos.length > 2) {
    return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  }
  return digitos;
}

export function DatePickerAR({
  id,
  name,
  value,
  defaultValue,
  onChange,
  max,
  min,
  disabled = false,
  required = false,
  placeholder = "DD/MM/AAAA",
  className,
}: Readonly<DatePickerARProps>) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = isControlled ? (value ?? "") : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [displayText, setDisplayText] = useState(() =>
    aTextoVisible(currentValue),
  );
  // Resincroniza el texto visible cuando currentValue cambia por una razón
  // externa (prop controlada nueva, o selección en el calendario) — mismo
  // patrón que shared/components/search-bar.tsx: el ajuste se hace acá,
  // durante el render, no en un efecto (evita el re-render en cascada).
  const [lastSyncedValue, setLastSyncedValue] = useState(currentValue);
  if (currentValue !== lastSyncedValue) {
    setLastSyncedValue(currentValue);
    setDisplayText(aTextoVisible(currentValue));
  }

  const minDate = aFecha(min);
  const maxDate = aFecha(max);

  const dentroDeRango = (fecha: Date): boolean => {
    if (minDate && fecha < minDate) return false;
    if (maxDate && fecha > maxDate) return false;
    return true;
  };

  const commit = (fecha: Date) => {
    const iso = format(fecha, FORMATO_ISO);
    if (!isControlled) setInternalValue(iso);
    setLastSyncedValue(iso);
    setDisplayText(format(fecha, FORMATO_VISIBLE));
    onChange?.(iso);
  };

  const handleTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    const masked = enmascarar(e.target.value);
    setDisplayText(masked);

    if (masked.length === 10) {
      const parsed = parse(masked, FORMATO_VISIBLE, new Date());
      if (isValid(parsed) && dentroDeRango(parsed)) {
        commit(parsed);
      }
    }
  };

  const handleBlur = () => {
    // Si lo que quedó tipeado no es una fecha completa y válida dentro de
    // rango, se descarta — vuelve a mostrar el último valor confirmado, en
    // vez de dejar un texto a medio escribir.
    const esperado = aTextoVisible(currentValue);
    if (displayText !== esperado) setDisplayText(esperado);
  };

  const handleSelect = (fecha: Date | undefined) => {
    if (!fecha) return;
    commit(fecha);
    setIsOpen(false);
  };

  const disabledMatcher =
    minDate || maxDate
      ? [
          ...(minDate ? [{ before: minDate }] : []),
          ...(maxDate ? [{ after: maxDate }] : []),
        ]
      : undefined;

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={displayText}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="pr-9"
        autoComplete="off"
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Abrir calendario"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={es}
            selected={aFecha(currentValue)}
            defaultMonth={aFecha(currentValue) ?? maxDate ?? new Date()}
            onSelect={handleSelect}
            disabled={disabledMatcher}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
