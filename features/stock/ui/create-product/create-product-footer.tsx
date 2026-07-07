import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";

type CreateProductFooterProps = {
  isPending: boolean;
  isCompressing: boolean;
  onCancel: () => void;
  formId?: string;
  cancelLabel?: string;
  idleLabel?: string;
  blockedReason?: string | null;
};

export function CreateProductFooter({
  isPending,
  isCompressing,
  onCancel,
  formId = "create-product-form",
  cancelLabel = "Cancelar",
  idleLabel = "Añadir Producto",
  blockedReason = null,
}: CreateProductFooterProps) {
  const isBlocked = Boolean(blockedReason);

  return (
    <div className="shrink-0 border-t border-border bg-card px-8 py-4 flex items-center justify-end gap-3 z-10">
      {blockedReason && (
        <p className="text-xs text-destructive mr-auto">{blockedReason}</p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isPending || isCompressing}
      >
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        form={formId}
        disabled={isPending || isCompressing || isBlocked}
      >
        {isCompressing || isPending ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : null}
        {isCompressing
          ? "Procesando..."
          : isPending
            ? "Guardando..."
            : idleLabel}
      </Button>
    </div>
  );
}
