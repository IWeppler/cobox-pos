"use client";

import { useCartStore } from "@/shared/store/cart-store";
import { createPublicBrowserClient } from "@/shared/config/supabase/client";
import { useSlugNegocio } from "@/shared/lib/use-negocio";
import { useShallow } from "zustand/react/shallow";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { ConfiguracionPOS } from "@/entities/config/types";
import { slugify } from "@/shared/utils/slugify";
import { CartSidebarHeader } from "@/shared/components/cart-sidebar/cart-sidebar-header";
import {
  generarLinkWhatsAppPublico,
  ModalidadEntregaPublica,
} from "@/shared/components/cart-sidebar/cart-sidebar-utils";
import { COLUMNAS_CONFIG_PUBLICA } from "@/shared/lib/columnas-publicas";
import type { OpcionPagoPublica } from "@/shared/lib/opciones-pago-publicas";
import { calcularTotalesPedido } from "@/shared/lib/totales-pedido-publico";
import { useDescuentosPago } from "./descuentos-pago-provider";
import { CartPasoProductos } from "./cart-paso-productos";
import {
  CartPasoDatos,
  type CampoPedido,
  type EnvioInfo,
  type ErroresPedido,
} from "./cart-paso-datos";
import { CartDesglosePublico } from "./cart-desglose-publico";

const subscribeToClientMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type PasoCarrito = "PRODUCTOS" | "DATOS";

/**
 * El carrito del catálogo público: DOS pasos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ CAMBIÓ Y POR QUÉ
 *
 * El paso 2 existe para poder preguntar UNA cosa que antes se resolvía por
 * chat: cómo va a pagar. Sin ese dato, el total que la clienta veía no era el
 * precio —faltaban el descuento por efectivo y el recargo por tarjeta— y la
 * pantalla lo compensaba con un disclaimer de tres líneas que decía, en
 * palabras, que el número de abajo podía cambiar. Preguntando, el total es el
 * total, y el desglose lo muestra renglón por renglón.
 *
 * Sigue sin ser un checkout: no se cobra, no se reserva stock y el pedido se
 * cierra por WhatsApp. Lo único que se gana es que el número que la clienta
 * acepta y el que le llega al comercio son el mismo, calculados en un solo
 * lugar (`shared/lib/totales-pedido-publico.ts`).
 *
 * VOLVER AL PASO 1 NO PIERDE NADA: todo el estado del formulario vive acá, en
 * el panel, no adentro del paso. Cambiar de paso desmonta la vista, no los
 * datos.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function CartPanelPublico({
  numeroWhatsApp,
}: Readonly<{ numeroWhatsApp?: string }>) {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, clearCart } =
    useCartStore(
      useShallow((state) => ({
        items: state.items,
        isOpen: state.isOpen,
        setIsOpen: state.setIsOpen,
        removeItem: state.removeItem,
        updateQuantity: state.updateQuantity,
        clearCart: state.clearCart,
      })),
    );

  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );

  const [branding, setBranding] = useState<ConfiguracionPOS | null>(null);

  const [paso, setPaso] = useState<PasoCarrito>("PRODUCTOS");
  const [nombre, setNombre] = useState("");
  const [modalidad, setModalidad] = useState<ModalidadEntregaPublica>("RETIRO");
  const [localidad, setLocalidad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [nota, setNota] = useState("");
  const [opcionPago, setOpcionPago] = useState<OpcionPagoPublica | null>(null);
  const [errores, setErrores] = useState<ErroresPedido>({});

  const refNombre = useRef<HTMLInputElement>(null);
  const refLocalidad = useRef<HTMLInputElement>(null);
  const refDireccion = useRef<HTMLInputElement>(null);
  const refPago = useRef<HTMLDivElement>(null);

  // Con el carrito vacío no hay pedido que completar: el paso 2 quedaría con un
  // formulario para nada.
  const pasoEfectivo: PasoCarrito = items.length === 0 ? "PRODUCTOS" : paso;

  // El slug sale de la RUTA, que lo tiene en los dos modos (subdominio y
  // /store/[negocio]). Sacándolo del host, en modo path no había slug y estas
  // tres consultas volvían vacías: sin promos, sin branding y sin métodos.
  // Cliente siempre anónimo: el catálogo es igual para todos.
  const slugNegocio = useSlugNegocio();
  const supabase = useMemo(
    () => createPublicBrowserClient(slugNegocio),
    [slugNegocio],
  );

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("configuracion_pos")
        .select(COLUMNAS_CONFIG_PUBLICA)
        .single();

      if (data) setBranding(data as ConfiguracionPOS);
    };

    fetchConfig();
  }, [supabase]);

  // Promociones y métodos NO se piden acá: bajan del layout por contexto, que
  // es la misma fuente que usa la anotación de precio de la grilla y de la
  // ficha. Dos lecturas distintas de las mismas tablas son dos momentos
  // distintos, y el síntoma sería una tarjeta prometiendo un descuento que el
  // desglose no da. Ver `descuentos-pago-provider.tsx`.
  const { promociones: promocionesDB, opcionesPago } = useDescuentosPago();

  // Compara la localidad tipeada contra la localidad del negocio con el mismo
  // criterio de normalización que ya usa normalizarAtributoKeyValor (slugify:
  // sin tildes, case-insensitive, tolera espacios/puntuación).
  const envioInfo: EnvioInfo | null = useMemo(() => {
    if (modalidad !== "ENVIO" || localidad.trim() === "") return null;

    const localidadNegocio = branding?.localidad_negocio?.trim() || "";
    const esLocal =
      localidadNegocio !== "" &&
      slugify(localidad) === slugify(localidadNegocio);

    if (esLocal) {
      return { tipo: "LOCAL", costo: Number(branding?.envio_costo_local) || 0 };
    }

    return {
      tipo: "LEJOS",
      mensaje:
        branding?.envio_mensaje_lejos ||
        "Envío a convenir — te contactamos por WhatsApp para coordinar",
    };
  }, [modalidad, localidad, branding]);

  const costoEnvio = envioInfo?.tipo === "LOCAL" ? envioInfo.costo || 0 : 0;

  // UNA sola cuenta para la pantalla y para el mensaje. Ver
  // `shared/lib/totales-pedido-publico.ts`.
  const totales = useMemo(
    () =>
      calcularTotalesPedido({
        items,
        promociones: promocionesDB,
        opcionPago,
        costoEnvio,
      }),
    [items, promocionesDB, opcionPago, costoEnvio],
  );

  if (!mounted) return null;

  const cerrarPanel = () => setIsOpen(false);

  const volverAProductos = () => {
    setErrores({});
    setPaso("PRODUCTOS");
  };

  /** El primer campo que falta, en el ORDEN EN QUE SE VEN: es al que va el
   * foco, y mandar el foco al segundo error salteándose el primero deja a la
   * clienta scrolleando para atrás. */
  const primerCampoFaltante = (): CampoPedido | null => {
    if (nombre.trim() === "") return "nombre";
    if (modalidad === "ENVIO" && localidad.trim() === "") return "localidad";
    if (modalidad === "ENVIO" && direccion.trim() === "") return "direccion";
    // El método solo es obligatorio si el negocio configuró alguno: sin
    // opciones no hay nada que elegir y bloquear el pedido sería castigar a la
    // clienta por la configuración del comercio.
    if (opcionesPago.length > 0 && !opcionPago) return "pago";
    return null;
  };

  const enviarPedido = () => {
    const faltante = primerCampoFaltante();

    if (faltante) {
      setErrores({
        nombre: nombre.trim() === "" ? "Completá tu nombre." : undefined,
        localidad:
          modalidad === "ENVIO" && localidad.trim() === ""
            ? "Completá tu localidad."
            : undefined,
        direccion:
          modalidad === "ENVIO" && direccion.trim() === ""
            ? "Completá la dirección de envío."
            : undefined,
        pago:
          opcionesPago.length > 0 && !opcionPago
            ? "Elegí cómo vas a pagar."
            : undefined,
      });

      const destino = {
        nombre: refNombre,
        localidad: refLocalidad,
        direccion: refDireccion,
        pago: refPago,
      }[faltante].current;
      destino?.scrollIntoView({ block: "center", behavior: "smooth" });
      // El grupo de pago es un div: se enfoca su primer botón, que es lo que
      // de verdad se puede accionar con el teclado.
      if (faltante === "pago") {
        destino?.querySelector("button")?.focus({ preventScroll: true });
      } else {
        (destino as HTMLInputElement | null)?.focus({ preventScroll: true });
      }
      return;
    }

    const href = generarLinkWhatsAppPublico({
      numeroWhatsApp,
      nombreComercio: branding?.posName,
      items,
      totales,
      etiquetaPago: opcionPago?.etiqueta ?? "A coordinar",
      nombreCliente: nombre,
      modalidad,
      direccion,
      localidad,
      envioACoordinar: envioInfo?.tipo === "LEJOS",
      nota,
    });

    if (href === "#") return;

    // Sincrónico dentro del click: abrirlo después de un await lo convierte en
    // un popup y el navegador lo bloquea.
    window.open(href, "_blank", "noopener,noreferrer");

    setNombre("");
    setModalidad("RETIRO");
    setLocalidad("");
    setDireccion("");
    setNota("");
    setOpcionPago(null);
    setErrores({});
    setPaso("PRODUCTOS");
    clearCart();
    cerrarPanel();
  };

  return (
    <>
      {isOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={cerrarPanel}
        />
      )}

      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-full transform flex-col border-l border-border bg-card transition-transform duration-300 ease-in-out sm:w-100 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <CartSidebarHeader
          isPOSMode={false}
          onClose={cerrarPanel}
          onBack={pasoEfectivo === "DATOS" ? volverAProductos : undefined}
        />

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
            {/* `alt=""` a propósito: la ilustración no agrega nada que el texto
                de abajo no diga. El PNG son 1230×1278 pero en pantalla nunca
                pasa de 160px, así que `sizes` es lo que hace que Next sirva una
                variante chica. `dark:opacity-50` porque la ilustración no se
                adapta al tema y en oscuro grita más que el texto. */}
            <Image
              src="/empty-cart.png"
              alt=""
              width={1230}
              height={1278}
              sizes="160px"
              className="mb-2 h-40 w-auto dark:opacity-50"
            />
            <p className="text-sm font-medium">Tu carrito esta vacio</p>
          </div>
        ) : pasoEfectivo === "PRODUCTOS" ? (
          <CartPasoProductos
            items={items}
            subtotal={totales.subtotal}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onSeguirComprando={cerrarPanel}
            onContinuar={() => setPaso("DATOS")}
          />
        ) : (
          <>
            <CartPasoDatos
              nombre={nombre}
              onNombreChange={setNombre}
              modalidad={modalidad}
              onModalidadChange={setModalidad}
              localidad={localidad}
              onLocalidadChange={setLocalidad}
              direccion={direccion}
              onDireccionChange={setDireccion}
              envioInfo={envioInfo}
              opcionesPago={opcionesPago}
              opcionPago={opcionPago}
              onOpcionPagoChange={(opcion) => {
                setOpcionPago(opcion);
                setErrores((previos) => ({ ...previos, pago: undefined }));
              }}
              nota={nota}
              onNotaChange={setNota}
              errores={errores}
              refNombre={refNombre}
              refLocalidad={refLocalidad}
              refDireccion={refDireccion}
              refPago={refPago}
            />

            <CartDesglosePublico totales={totales} onEnviarPedido={enviarPedido} />
          </>
        )}
      </div>
    </>
  );
}
