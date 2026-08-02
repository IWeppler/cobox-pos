"use client";

import { ShieldAlert } from "lucide-react";
import { EmpleadosLista } from "./empleados-lista";
import { PermisosMatriz } from "./permisos-matriz";
import {
  InvitacionesPanel,
  type InvitacionPendiente,
} from "./invitaciones-panel";
import type { Permiso, PerfilConRol, Rol, RolPermiso } from "@/entities/roles/types";

interface EmpleadosPanelProps {
  isAdmin: boolean;
  empleados: PerfilConRol[];
  roles: Rol[];
  permisos: Permiso[];
  rolPermisos: RolPermiso[];
  invitaciones?: InvitacionPendiente[];
}

export function EmpleadosPanel({
  isAdmin,
  empleados,
  roles,
  permisos,
  rolPermisos,
  invitaciones = [],
}: Readonly<EmpleadosPanelProps>) {
  if (!isAdmin) {
    return (
      <div className="bg-card text-card-foreground p-6 rounded-2xl border border-border flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold">Acceso restringido</h2>
        <p className="text-muted-foreground mt-2 text-sm max-w-sm">
          Esta sección es solo para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in-50 duration-300">
      <EmpleadosLista empleados={empleados} roles={roles} />
      <InvitacionesPanel roles={roles} invitaciones={invitaciones} />
      <PermisosMatriz
        roles={roles}
        permisos={permisos}
        rolPermisos={rolPermisos}
      />
    </div>
  );
}
