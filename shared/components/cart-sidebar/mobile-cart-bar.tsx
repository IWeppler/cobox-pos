"use client";

import { ChevronUp } from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";

interface MobileCartBarProps {
  totalItems: number;
  totalPrice: number;
  onOpen: () => void;
}

export function MobileCartBar({
  totalItems,
  totalPrice,
  onOpen,
}: Readonly<MobileCartBarProps>) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed h-18 inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-sidebar px-4 py-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-foreground shadow-[0_-2px_10px_rgba(0,0,0,0.1)] active:opacity-90"
    >
      <div className="flex flex-col text-left">
      <span className="text-xs font-mono font-medium uppercase">
        {totalItems} {totalItems === 1 ? "producto" : "productos"}{" "}
      </span>
      <span className="font-mono text-xl font-medium">
        {formatearMoneda(totalPrice)}
      </span>
      </div>
      <div className="flex h-10 w-10 items-center justify-center bg-primary rounded-lg">
      <ChevronUp className="h-5 w-5 shrink-0" />
      </div>
    </button>
  );
}
