"use client";

import { ScanBarcode } from "lucide-react";
import { Input } from "@/shared/ui/input";
import type { RefObject } from "react";

interface CargaRapidaInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: (value: string) => void;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function CargaRapidaInput({
  value,
  onChange,
  onEnter,
  disabled,
  inputRef,
}: Readonly<CargaRapidaInputProps>) {
  return (
    <div className="relative">
      <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        ref={inputRef}
        autoFocus
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter(value);
          }
        }}
        placeholder="Escaneá o escribí código, SKU o nombre..."
        className="pl-11 h-14 text-base rounded-xl border-border bg-card shadow-sm"
      />
    </div>
  );
}
