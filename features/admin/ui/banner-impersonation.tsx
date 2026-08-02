import { KeyRound, LogOut } from "lucide-react";
import { terminarImpersonationAction } from "@/features/admin/actions/impersonate";

/**
 * Aviso de que estás viendo el negocio de un cliente con el modo dios puesto.
 * Sin esto es fácil olvidarse y editar datos reales de otro comercio creyendo
 * que son propios.
 */
export function BannerImpersonation({
  nombreNegocio,
}: Readonly<{ nombreNegocio: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-warning/15 border-b border-warning/30 text-sm">
      <span className="flex items-center gap-2 min-w-0">
        <KeyRound className="w-4 h-4 text-warning shrink-0" />
        <span className="truncate">
          Modo Comerz: estás viendo{" "}
          <strong className="font-semibold">{nombreNegocio}</strong>. Todo lo
          que hagas queda en los datos reales de ese comercio.
        </span>
      </span>

      <form action={terminarImpersonationAction}>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-warning/40 hover:bg-warning/20 transition-colors font-medium shrink-0 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Salir
        </button>
      </form>
    </div>
  );
}
