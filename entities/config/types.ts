export interface ConfiguracionPOS {
  id: string;
  posName: string;
  posLogo: string;
  whatsapp: string;
  direccion: string;
  mensaje_ticket: string;

  // Catálogo y E-commerce
  catalogo_activo?: boolean;
  mostrar_precios?: boolean;
  mostrar_sin_stock?: boolean;
  pedidos_whatsapp?: boolean;
  direccion_visible?: boolean;
  horario_visible?: boolean;

  // Redes y Horarios
  instagram?: string;
  facebook?: string;
  horario_texto?: string;

  // Envíos del catálogo público
  localidad_negocio?: string | null;
  envio_costo_local?: number | null;
  envio_mensaje_lejos?: string | null;

  // Banner Promocional
  banner_activo?: boolean;
  banner_imagen?: string;
  banner_titulo?: string;
  banner_subtitulo?: string;
  banner_boton_texto?: string;
  banner_link?: string;

  // Marquee
  marquee_activo?: boolean;
  marquee_texto?: string;

  // Configuración de Cuentas Corrientes
  cc_activas?: boolean;
  cc_recargo_default?: number;
  cc_anticipo_default?: number;
  cc_limite_default?: number;
  cc_plazo_mora?: number;
  crm_dias_inactivo?: number;

  // Configuración de Caja
  modo_caja?: "UNICA" | "POR_USUARIO" | "POR_PUNTO_VENTA";
  requiere_caja_abierta?: boolean;

  // Configuración de Stock
  permitir_venta_sin_stock?: boolean;
}
