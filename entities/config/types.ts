import type { ModoFacturacion, TipoComprobante } from "@/shared/lib/facturacion";

export type RecargoMoraTipo = "NINGUNO" | "MONTO_FIJO" | "PORCENTAJE";

/** Rubro del comercio. Decide qué columnas muestra Inventario: indumentaria
 * razona por talle/color (N variantes), electro por modelo/EAN. */
export type Rubro = "indumentaria" | "electro" | "alimentos" | "farmacia" | "ferreteria" | "quioscos" | "otros";

export const RUBRO_DEFAULT: Rubro = "indumentaria";

/** Fail-closed: un rubro desconocido (columna nueva, valor viejo, fila sin
 * config) cae a indumentaria, que es el comportamiento previo a T4. */
export function normalizarRubro(valor: unknown): Rubro {
  return valor === "electro" ? "electro" : RUBRO_DEFAULT;
}

export interface ConfiguracionPOS {
  id: string;
  posName: string;
  posLogo: string;
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  inicio_actividades: string;
  provincia: string;
  localidad: string;
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
  entrega_minima_bloqueante?: boolean;
  cc_limite_default?: number;
  cc_plazo_mora?: number;
  crm_dias_inactivo?: number;
  recargo_mora_tipo?: RecargoMoraTipo;
  recargo_mora_valor?: number;

  // Configuración de Caja
  modo_caja?: "UNICA" | "POR_USUARIO" | "POR_PUNTO_VENTA";
  requiere_caja_abierta?: boolean;

  // Configuración de Stock
  permitir_venta_sin_stock?: boolean;

  // Rubro del comercio (T4) — default 'indumentaria' en la BD
  rubro?: Rubro;

  // Facturación. Los valores y sus reglas viven en
  // features/ticket/lib/facturacion.ts: `comprobante_defecto` solo puede ser
  // una factura si `modo_facturacion` es ARCA, y eso lo frena un CHECK.
  modo_facturacion?: ModoFacturacion;
  comprobante_defecto?: TipoComprobante;
  /** Punto de venta de ARCA. null = todavía no dado de alta. */
  punto_venta?: number | null;
}
