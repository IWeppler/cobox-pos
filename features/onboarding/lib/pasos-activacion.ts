import { normalizarRubro, type Rubro } from "@/entities/config/types";

/**
 * Los pasos de la guía de inicio, derivados del estado real del negocio.
 *
 * Módulo puro y sin IO a propósito (recibe el estado ya resuelto por la RPC
 * `estado_activacion`): la lista de pasos, cuáles son obligatorios y cuándo se
 * considera activado el comercio son reglas de negocio, y así se testean sin
 * base.
 *
 * Por qué checklist y no tour por módulos: la pregunta del día 1 no es "qué
 * hace cada pantalla", es "qué me falta para vender". La explicación de cada
 * módulo va en su propio empty state, donde el usuario ya está parado en el
 * problema.
 */

/** Las claves son las mismas que devuelve la RPC. */
export interface EstadoActivacion {
  rubro: string;
  marca: boolean;
  metodos_pago: boolean;
  productos: boolean;
  stock_y_precios: boolean;
  empleados: boolean;
  catalogo_publicado: boolean;
  caja: boolean;
  primera_venta: boolean;
}

/** Una de las formas de resolver un paso. Existen porque "te falta cargar
 * productos" + un link a /stock deja al comerciante parado en una pantalla
 * vacía sin saber que tiene tres caminos distintos según de dónde venga la
 * mercadería. */
export interface OpcionDePaso {
  titulo: string;
  detalle: string;
  /** A dónde lleva. Ausente cuando la opción NO es una pantalla sino algo que
   * ya está a la vista (el chip de caja del navbar): ahí el texto explica
   * dónde mirar, que es lo que hacía falta. */
  href?: string;
}

export interface PasoActivacion {
  clave: keyof Omit<EstadoActivacion, "rubro">;
  titulo: string;
  detalle: string;
  href: string;
  cta: string;
  hecho: boolean;
  /** Los caminos posibles, desplegables desde la card. */
  opciones?: OpcionDePaso[];
  /** Marca que el botón NO navega sino que dispara algo en la app. Hoy solo
   * "abrir-caja", que abre el modal del navbar donde de verdad se abre el
   * turno. La lib se mantiene pura: describe la intención, no la ejecuta. */
  accion?: "abrir-caja";
  /** No cuenta para el progreso ni frena la activación: hay comercios
   * unipersonales y comercios que no quieren tienda online. Se listan igual
   * porque si no, nadie se entera de que existen. */
  opcional: boolean;
}

export function construirPasosActivacion(
  estado: EstadoActivacion,
): PasoActivacion[] {
  const rubro: Rubro = normalizarRubro(estado.rubro);
  // El único camino que NO aplica a todos es el escaneo de código de barras:
  // depende de que el producto lo traiga. La ropa de proveedor local casi
  // nunca lo tiene — es la misma razón por la que su plantilla tampoco lleva
  // la columna (ver columnas-por-rubro.ts).
  const porCodigoDeBarras = rubro !== "indumentaria";

  return [
    {
      clave: "marca",
      titulo: "Ponele tu cara al negocio",
      detalle:
        "Subí tu logo y cargá el WhatsApp: van en el ticket y en tu tienda online.",
      href: "/configuracion",
      cta: "Configurar",
      hecho: estado.marca,
      opcional: false,
    },
    {
      clave: "metodos_pago",
      titulo: "Revisá cómo cobrás",
      detalle:
        "Efectivo ya está listo. Sumá tarjeta o transferencia con su recargo y su comisión.",
      href: "/configuracion",
      cta: "Ver métodos",
      hecho: estado.metodos_pago,
      opcional: false,
    },
    {
      clave: "productos",
      titulo: "Cargá tus productos",
      detalle:
        "Con una planilla, con el remito de tu proveedor o de a uno. Nada toca el stock hasta que lo revisás.",
      href: porCodigoDeBarras ? "/stock/carga-rapida" : "/stock",
      cta: "Cargar",
      hecho: estado.productos,
      opcional: false,
      // Los caminos son los MISMOS para todos los rubros. Antes se ofrecía uno
      // u otro según el rubro —planilla en electro, remito en indumentaria—
      // como si una tienda de ropa no pudiera tener una planilla propia. Lo
      // que cambia con el rubro son las columnas de la plantilla, no el
      // camino.
      opciones: [
        {
          titulo: "Con una planilla tuya",
          detalle:
            "Descargás la plantilla de tu rubro, la completás y la subís. El sistema te muestra qué es nuevo y qué ya tenías antes de tocar el stock.",
          href: "/stock",
        },
        {
          titulo: "Con el remito de tu proveedor",
          detalle:
            "Su archivo, con los nombres como los escribe él. El sistema propone contra qué producto tuyo va cada línea y aprende para la próxima.",
          href: "/stock",
        },
        // La carga rápida por código de barras solo aparece donde el código de
        // barras existe de verdad: la ropa de proveedor local casi nunca lo
        // trae, y ofrecerla ahí manda a una pantalla que no va a servir.
        ...(porCodigoDeBarras
          ? [
              {
                titulo: "Escaneando el código de barras",
                detalle:
                  "Escaneás el EAN y la ficha viene del catálogo maestro. Es lo más rápido para pocos productos.",
                href: "/stock/carga-rapida",
              },
            ]
          : []),
        {
          titulo: "De a uno, a mano",
          detalle:
            "Un producto por vez, con su precio y su stock. Sirve para lo que no está en ninguna planilla.",
          href: "/stock",
        },
      ],
    },
    {
      clave: "stock_y_precios",
      titulo: "Poneles precio y stock",
      detalle:
        "Un producto sin precio o sin unidades no se puede vender en el mostrador.",
      href: "/stock",
      cta: "Completar",
      hecho: estado.stock_y_precios,
      opcional: false,
    },
    {
      clave: "empleados",
      titulo: "Sumá a tu equipo",
      detalle:
        "Cada quien con su usuario: así sabés quién vendió y cada uno cierra su propia caja.",
      href: "/configuracion",
      cta: "Invitar",
      hecho: estado.empleados,
      opcional: true,
    },
    {
      clave: "caja",
      titulo: "Abrí la caja",
      detalle:
        "El monto inicial es la plata que hay en el cajón ahora. Al cerrar, el sistema te dice si cuadra.",
      // El botón abre el modal del navbar, no navega. Mandar a /caja era el
      // error: esa pantalla muestra el historial y los arqueos, pero el turno
      // se abre desde el chip "Caja cerrada" de arriba a la derecha.
      href: "/caja",
      accion: "abrir-caja",
      cta: "Abrir caja",
      hecho: estado.caja,
      opcional: false,
      opciones: [
        {
          titulo: 'El chip "Caja cerrada", arriba a la derecha',
          detalle:
            "Está siempre a la vista, en cualquier pantalla. Ahí se abre y se cierra el turno, y te dice de un vistazo cuánto efectivo debería haber.",
        },
        {
          titulo: "La pantalla de Caja",
          detalle:
            "Para lo que pasa después: el detalle del día, los arqueos y el historial de turnos.",
          href: "/caja",
        },
      ],
    },
    {
      clave: "primera_venta",
      titulo: "Hacé tu primera venta",
      detalle: "Es lo último que falta. Después ya trabajás normal.",
      href: "/pos",
      cta: "Ir al POS",
      hecho: estado.primera_venta,
      opcional: false,
    },
    {
      clave: "catalogo_publicado",
      titulo: "Publicá tu tienda online",
      detalle:
        "Prendé el catálogo y publicá productos: tus clientes te compran por WhatsApp desde ahí.",
      href: "/configuracion",
      cta: "Publicar",
      hecho: estado.catalogo_publicado,
      opcional: true,
    },
  ];
}

export interface ProgresoActivacion {
  pasos: PasoActivacion[];
  /** Cuántos obligatorios están hechos. Los opcionales no cuentan: si contaran,
   * el comercio unipersonal nunca llegaría al 100% y la barra le mentiría. */
  completados: number;
  total: number;
  /**
   * Lo que apaga la guía: todos los obligatorios hechos, O una venta hecha.
   *
   * El segundo caso es la red de seguridad para los comercios que ya trabajan.
   * Si vendió, está activado por definición — cualquier paso que dé en falso
   * después de eso es un bug de la detección, y el costo de equivocarse es
   * mostrarle "primeros pasos" a alguien que factura hace un año.
   */
  activado: boolean;
  /** El primero que falta, obligatorio u opcional. Es el que la card destaca. */
  siguiente: PasoActivacion | null;
}

export function calcularProgresoActivacion(
  estado: EstadoActivacion,
): ProgresoActivacion {
  const pasos = construirPasosActivacion(estado);
  const obligatorios = pasos.filter((p) => !p.opcional);

  return {
    pasos,
    completados: obligatorios.filter((p) => p.hecho).length,
    total: obligatorios.length,
    activado: estado.primera_venta || obligatorios.every((p) => p.hecho),
    siguiente: pasos.find((p) => !p.hecho) ?? null,
  };
}
