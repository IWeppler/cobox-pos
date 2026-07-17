export interface Rol {
  id: string;
  nombre: string;
  es_sistema: boolean;
}

export interface Permiso {
  id: string;
  clave: string;
  modulo: string;
  descripcion: string | null;
}

export interface RolPermiso {
  rol_id: string;
  permiso_id: string;
}

export interface PerfilConRol {
  id: string;
  nombre: string;
  email: string;
  rol_id: string;
  roles: {
    nombre: string;
  } | null;
}

export interface EmpleadosActionState {
  error: string | null;
  success: boolean;
}
