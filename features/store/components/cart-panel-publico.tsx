"use client";

import { useCartStore } from "@/shared/store/cart-store";
import { createClient } from "@/shared/config/supabase/client";
import { useShallow } from "zustand/react/shallow";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ConfiguracionPOS } from "@/entities/config/types";
import { slugify } from "@/shared/utils/slugify";
import { CartSidebarHeader } from "@/shared/components/cart-sidebar/cart-sidebar-header";
import { CartStepItems } from "@/shared/components/cart-sidebar/cart-step-items";
import {
  calcularDescuentoCarritoPublico,
  generarLinkWhatsAppPublico,
  getPromocionesElegibles,
  ModalidadEntregaPublica,
} from "@/shared/components/cart-sidebar/cart-sidebar-utils";
import { PromocionDB } from "@/shared/components/cart-sidebar/types";
import { CartCheckoutPublico, EnvioInfo } from "./cart-checkout-publico";
import { CartFooterPublico } from "./cart-footer-publico";

const subscribeToClientMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
type CheckoutStep = "CART" | "CHECKOUT";

export function CartPanelPublico({
  numeroWhatsApp,
}: Readonly<{ numeroWhatsApp?: string }>) {
  const {
    items,
    isOpen,
    setIsOpen,
    removeItem,
    updateQuantity,
    getTotalPrice,
    clearCart,
  } = useCartStore(
    useShallow((state) => ({
      items: state.items,
      isOpen: state.isOpen,
      setIsOpen: state.setIsOpen,
      removeItem: state.removeItem,
      updateQuantity: state.updateQuantity,
      getTotalPrice: state.getTotalPrice,
      clearCart: state.clearCart,
    })),
  );

  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );

  const [branding, setBranding] = useState<ConfiguracionPOS | null>(null);
  const [promocionesDB, setPromocionesDB] = useState<PromocionDB[]>([]);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("CART");

  const [nombre, setNombre] = useState("");
  const [modalidad, setModalidad] = useState<ModalidadEntregaPublica>("RETIRO");
  const [localidad, setLocalidad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [nota, setNota] = useState("");

  const totalCarrito = getTotalPrice();
  const effectiveCheckoutStep: CheckoutStep =
    items.length === 0 ? "CART" : checkoutStep;

  useEffect(() => {
    const fetchConfig = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("configuracion_pos")
        .select("*")
        .single();

      if (data) {
        setBranding(data as ConfiguracionPOS);
      }
    };

    fetchConfig();
  }, []);

  useEffect(() => {
    // Sin gate de sesión a propósito: esto es informativo para cualquier
    // visitante anónimo del catálogo, no una acción que requiera estar
    // logueado.
    const fetchPromos = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("promociones")
        .select(
          `
            *,
            promociones_metodos_pago ( metodo_pago ),
            promociones_categorias ( categoria_nombre )
          `,
        )
        .eq("activa", true);

      if (data) setPromocionesDB(data as unknown as PromocionDB[]);
    };

    fetchPromos();
  }, []);

  const promocionesElegibles = useMemo(() => {
    return getPromocionesElegibles({
      promociones: promocionesDB,
      totalCarrito,
      pagos: [],
      items,
      metodosPago: [],
      canal: "PUBLICO",
    });
  }, [promocionesDB, totalCarrito, items]);

  const descuentoCarrito = useMemo(() => {
    return calcularDescuentoCarritoPublico({
      promocionesElegibles,
      totalCarrito,
      items,
    });
  }, [promocionesElegibles, totalCarrito, items]);

  // Compara la localidad tipeada contra la localidad del negocio con el
  // mismo criterio de normalización que ya usa normalizarAtributoKeyValor
  // (slugify: sin tildes, case-insensitive, tolera espacios/puntuación).
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

  if (!mounted) return null;

  const closeSidebar = () => {
    setCheckoutStep("CART");
    setIsOpen(false);
  };

  const clearCartAndResetStep = () => {
    clearCart();
    setCheckoutStep("CART");
  };

  const nombreValido = nombre.trim() !== "";
  const localidadValida = modalidad === "RETIRO" || localidad.trim() !== "";
  const direccionValida = modalidad === "RETIRO" || direccion.trim() !== "";
  const puedeEnviar = nombreValido && localidadValida && direccionValida;

  let motivoInvalido: string | undefined;
  if (!nombreValido) {
    motivoInvalido = "Completá tu nombre para poder enviar el pedido.";
  } else if (!localidadValida) {
    motivoInvalido = "Completá tu localidad para poder enviar el pedido.";
  } else if (!direccionValida) {
    motivoInvalido = "Completá la dirección de envío para poder enviar el pedido.";
  }

  const costoEnvio = envioInfo?.tipo === "LOCAL" ? envioInfo.costo || 0 : 0;

  const handleEnviarPedido = () => {
    setNombre("");
    setModalidad("RETIRO");
    setLocalidad("");
    setDireccion("");
    setNota("");
    clearCartAndResetStep();
    closeSidebar();
  };

  return (
    <>
      {isOpen && (
        <button
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-100 bg-card flex flex-col border-l border-border transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0 z-50" : "translate-x-full z-50"
        }`}
      >
        <CartSidebarHeader isPOSMode={false} onClose={closeSidebar} />

        {effectiveCheckoutStep === "CART" ? (
          <CartStepItems
            items={items}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            totalCarrito={totalCarrito}
            onContinueToPayment={() => setCheckoutStep("CHECKOUT")}
            continueLabel="Continuar"
          />
        ) : (
          <CartCheckoutPublico
            nombre={nombre}
            onNombreChange={setNombre}
            modalidad={modalidad}
            onModalidadChange={setModalidad}
            localidad={localidad}
            onLocalidadChange={setLocalidad}
            direccion={direccion}
            onDireccionChange={setDireccion}
            envioInfo={envioInfo}
            nota={nota}
            onNotaChange={setNota}
            onBackToCart={() => setCheckoutStep("CART")}
          >
            {items.length > 0 ? (
              <CartFooterPublico
                totalCarrito={totalCarrito}
                totalConDescuento={descuentoCarrito.totalConDescuento}
                costoEnvio={costoEnvio}
                calculablesAplicadas={descuentoCarrito.calculablesAplicadas}
                informativasCondicionales={
                  descuentoCarrito.informativasCondicionales
                }
                puedeEnviar={puedeEnviar}
                motivoInvalido={motivoInvalido}
                whatsappHref={generarLinkWhatsAppPublico({
                  numeroWhatsApp,
                  nombreComercio: branding?.posName,
                  items,
                  total: descuentoCarrito.totalConDescuento + costoEnvio,
                  nombreCliente: nombre,
                  modalidad,
                  direccion,
                  localidad,
                  costoEnvio,
                  nota,
                  promocionesAplicadas: descuentoCarrito.calculablesAplicadas,
                  promocionesCondicionales:
                    descuentoCarrito.informativasCondicionales,
                })}
                onEnviarPedido={handleEnviarPedido}
                onClearCart={clearCartAndResetStep}
              />
            ) : null}
          </CartCheckoutPublico>
        )}
      </div>
    </>
  );
}
