"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  seleccionarNegocioAction,
  type MembresiaNegocio,
} from "@/features/auth/actions/negocios";

interface NegocioSwitcherProps {
  negocios: MembresiaNegocio[];
  negocioActivoId?: string;
  /** Nombre y logo del negocio activo, que ya vienen de configuracion_pos. */
  nombreActivo: string;
  logoActivo?: string;
  inicial: string;
  isCollapsed: boolean;
}

export function NegocioSwitcher({
  negocios,
  negocioActivoId,
  nombreActivo,
  logoActivo,
  inicial,
  isCollapsed,
}: Readonly<NegocioSwitcherProps>) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [cambiandoA, setCambiandoA] = useState<string | null>(null);

  const cambiar = (negocioId: string) => {
    if (negocioId === negocioActivoId) return;
    setCambiandoA(negocioId);
    startTransition(async () => {
      const res = await seleccionarNegocioAction(negocioId);
      setCambiandoA(null);
      if (!res.success) return;
      // Refresh completo: el negocio cambia TODOS los datos de la pantalla
      // actual, no solo el nombre del sidebar.
      router.refresh();
    });
  };

  const avatar = (
    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
      {logoActivo ? (
        <Image
          src={logoActivo}
          alt={nombreActivo}
          width={28}
          height={28}
          className="object-cover w-full h-full"
        />
      ) : (
        <span className="font-bold text-xs text-primary">{inicial}</span>
      )}
    </div>
  );

  const claseBoton = `flex items-center gap-2.5 rounded-lg border border-border/50 bg-background/50 w-full ${
    isCollapsed ? "p-1.5 justify-center" : "p-2"
  }`;

  // Con un solo negocio no hay nada que elegir: se muestra igual pero sin
  // menú, para no ofrecer una acción que no hace nada.
  if (negocios.length <= 1) {
    return (
      <div className={claseBoton}>
        {avatar}
        {!isCollapsed && (
          <span className="font-semibold text-sm truncate flex-1 text-left">
            {nombreActivo}
          </span>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={claseBoton} aria-label="Cambiar de negocio">
          {pendiente ? (
            <Loader2 className="w-7 h-7 p-1.5 animate-spin shrink-0" />
          ) : (
            avatar
          )}
          {!isCollapsed && (
            <>
              <span className="font-semibold text-sm truncate flex-1 text-left">
                {nombreActivo}
              </span>
              <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Tus negocios
        </DropdownMenuLabel>

        {negocios.map((negocio) => (
          <DropdownMenuItem
            key={negocio.negocio_id}
            disabled={pendiente}
            onSelect={() => cambiar(negocio.negocio_id)}
            className="gap-2"
          >
            {cambiandoA === negocio.negocio_id ? (
              <Loader2 className="size-4 animate-spin shrink-0" />
            ) : (
              <Check
                className={`size-4 shrink-0 ${
                  negocio.negocio_id === negocioActivoId
                    ? "opacity-100"
                    : "opacity-0"
                }`}
              />
            )}
            <span className="flex flex-col">
              <span className="text-sm">{negocio.nombre}</span>
              <span className="text-xs text-muted-foreground">
                {negocio.es_owner ? "Dueño" : negocio.rol}
              </span>
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/crear-negocio" className="gap-2">
            <Plus className="size-4" />
            <span className="text-sm">Crear otro negocio</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
