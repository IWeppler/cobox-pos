"use client";

import { useCartStore } from "@/shared/store/cart-store";
import { createClient } from "@/shared/config/supabase/client";
import { useShallow } from "zustand/react/shallow";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { registrarVentaAction } from "@/features/sales/actions/create-sale";
import { TicketSheet } from "@/features/sales/ui/ticket-sheet";
import { TicketData, CreateSalePaymentInput } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";
import { MetodoPago } from "@/entities/payments/types";
import { CartSidebarFooter } from "./cart-sidebar/cart-sidebar-footer";
import { CartSidebarHeader } from "./cart-sidebar/cart-sidebar-header";
import { CartStepCheckout } from "./cart-sidebar/cart-step-checkout";
import { CartStepItems } from "./cart-sidebar/cart-step-items";
import { PromocionDB } from "./cart-sidebar/types";
import {
  generarLinkWhatsApp,
  getDescuentoDetalle,
  getPromocionActivaId,
  getPromocionesElegibles,
} from "./cart-sidebar/cart-sidebar-utils";
import { ClienteBasico } from "./cart-sidebar/client-selector";

const subscribeToClientMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
type CheckoutStep = "CART" | "PAYMENT";

export function CartSidebar({
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

  const router = useRouter();
  const pathname = usePathname();
  const isPosRoute = pathname === "/pos";

  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [isPending, startTransition] = useTransition();

  const [branding, setBranding] = useState<ConfiguracionPOS | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [metodosPagoDB, setMetodosPagoDB] = useState<MetodoPago[]>([]);
  const [pagos, setPagos] = useState<CreateSalePaymentInput[]>([]);
  const [modoMixto, setModoMixto] = useState(false);
  const [isCuentaCorriente, setIsCuentaCorriente] = useState(false);

  const [promocionesDB, setPromocionesDB] = useState<PromocionDB[]>([]);
  const [promocionId, setPromocionId] = useState("ninguna");
  const [ventaExitosa, setVentaExitosa] = useState<TicketData | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("CART");
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<ClienteBasico | null>(null);

  const isPOSMode = isAdmin;
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
    const supabase = createClient();
    let isMounted = true;

    const checkUserAndFetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      setIsAdmin(!!session);

      if (session) {
        const { data: promos } = await supabase
          .from("promociones")
          .select(
            `
              *,
              promociones_metodos_pago ( metodo_pago ),
              promociones_categorias ( categoria_nombre )
            `,
          )
          .eq("activa", true);

        if (promos) setPromocionesDB(promos as unknown as PromocionDB[]);

        const { data: metodos } = await supabase
          .from("metodos_pago")
          .select("id, nombre, tipo, comision")
          .eq("activo", true)
          .order("comision", { ascending: true });

        if (metodos) {
          setMetodosPagoDB(metodos as unknown as MetodoPago[]);
        }
      }
    };

    checkUserAndFetchData();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) setIsAdmin(!!session);
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const promocionesElegibles = useMemo(() => {
    return getPromocionesElegibles({
      promociones: promocionesDB,
      totalCarrito,
      pagos,
      items,
      metodosPago: metodosPagoDB,
    });
  }, [promocionesDB, totalCarrito, pagos, items, metodosPagoDB]);

  const promocionActivaId = useMemo(() => {
    return getPromocionActivaId(promocionId, promocionesElegibles);
  }, [promocionesElegibles, promocionId]);

  const descuentoDetalle = useMemo(() => {
    return getDescuentoDetalle({
      promocionActivaId,
      promocionesElegibles,
      totalCarrito,
      items,
    });
  }, [promocionActivaId, promocionesElegibles, totalCarrito, items]);

  const subtotalConDescuento = totalCarrito - descuentoDetalle.monto;
  const recargoCuentaCorriente = isCuentaCorriente
    ? (subtotalConDescuento * (branding?.cc_recargo_default || 0)) / 100
    : 0;

  const totalFinal = subtotalConDescuento + recargoCuentaCorriente;
  const anticipoMinimo = isCuentaCorriente
    ? (totalFinal * (branding?.cc_anticipo_default || 0)) / 100
    : 0;
  const firstPagoId = pagos[0]?.metodoPagoId;

  const metodoPagoRapidoId = firstPagoId || metodosPagoDB[0]?.id || "";
  const pagosSincronizados = useMemo<CreateSalePaymentInput[]>(() => {
    if (modoMixto) return pagos;
    if (!metodoPagoRapidoId) return [];
    return [
      {
        metodoPagoId: metodoPagoRapidoId,
        montoAsignado: isCuentaCorriente ? anticipoMinimo : totalFinal,
      },
    ];
  }, [
    anticipoMinimo,
    isCuentaCorriente,
    metodoPagoRapidoId,
    modoMixto,
    pagos,
    totalFinal,
  ]);

  const sumaPagos = useMemo(
    () =>
      pagosSincronizados.reduce(
        (acc, p) => acc + Number(p.montoAsignado || 0),
        0,
      ),
    [pagosSincronizados],
  );

  // 🚀 FIX: AUTO-SYNC DE PAGOS (Garantiza que el cajero nunca vea "$4.248 de $4.720")
  if (!mounted) return null;

  const closeSidebar = () => {
    setCheckoutStep("CART");
    setIsOpen(false);
  };

  const clearCartAndResetStep = () => {
    clearCart();
    setCheckoutStep("CART");
  };

  const handleCuentaCorrienteChange = (value: boolean) => {
    setIsCuentaCorriente(value);
    if (value) {
      setPromocionId("ninguna");
    }
  };

  const handleContinueToPayment = () => {
    if (pagos.length === 0 && metodosPagoDB.length > 0) {
      setPagos([
        {
          metodoPagoId: metodosPagoDB[0].id,
          montoAsignado: totalFinal,
        },
      ]);
    }
    setCheckoutStep("PAYMENT");
  };

  const handleEnviarPedidoWhatsApp = () => {
    setTimeout(() => {
      clearCartAndResetStep();
      closeSidebar();
    }, 1000);
  };

  const handleConfirmarVentaPOS = (montoAnticipoModal?: number) => {
    const montoRealAsignado =
      montoAnticipoModal !== undefined ? montoAnticipoModal : sumaPagos;

    if (isCuentaCorriente && !clienteSeleccionado) {
      toast.error("Selecciona un cliente para Cuenta Corriente.");
      return;
    }

    if (isCuentaCorriente && montoRealAsignado + 0.05 < anticipoMinimo) {
      toast.error("El anticipo no alcanza el minimo requerido.", {
        description: `Minimo: $${anticipoMinimo.toLocaleString("es-AR")}`,
      });
      return;
    }

    if (!isCuentaCorriente && Math.abs(montoRealAsignado - totalFinal) > 0.05) {
      toast.error("La suma de los pagos no coincide con el total.", {
        description:
          "Asegúrate de asignar el dinero exacto para poder cerrar la caja correctamente.",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (!items.length) {
          toast.error("El carrito está vacío.");
          return;
        }

        // ARMAMOS LOS PAGOS DEFINITIVOS PARA EL BACKEND
        let pagosToSubmit = [...pagosSincronizados];
        if (isCuentaCorriente && montoAnticipoModal !== undefined) {
          // Tomamos el método de pago seleccionado y le asignamos el anticipo tipeado
          pagosToSubmit = [
            { ...pagosSincronizados[0], montoAsignado: montoAnticipoModal },
          ];
        }

        const formData = new FormData();
        formData.append("cart_items", JSON.stringify(items));
        formData.append("pagos", JSON.stringify(pagosToSubmit));
        formData.append("metodo_pago_id", pagosToSubmit[0]?.metodoPagoId || "");
        formData.append("is_cuenta_corriente", String(isCuentaCorriente));
        formData.append("recargo_cc", String(recargoCuentaCorriente));

        if (clienteSeleccionado) {
          formData.append("cliente_id", clienteSeleccionado.id);
        }

        if (promocionActivaId !== "ninguna" && descuentoDetalle.monto > 0) {
          formData.append("promocion_id", promocionActivaId);
          formData.append("descuento_monto", descuentoDetalle.monto.toString());
        }

        const result = await registrarVentaAction(
          { error: null, success: false },
          formData,
        );

        if (!result.success) {
          if (result.error === "CAJA_CERRADA") {
            toast.error("La caja está cerrada", {
              description:
                "Debes abrir un turno en el módulo de Caja para poder cobrar.",
              action: {
                label: "Ir a Caja",
                onClick: () => {
                  closeSidebar();
                  router.push("/caja");
                },
              },
            });
          } else {
            toast.error("No se pudo registrar la venta.", {
              description: result.error ?? "Intenta nuevamente.",
            });
          }
          return;
        }

        toast.success("Venta registrada con éxito!");

        const nombreMetodoMostrar =
          pagosToSubmit.length > 1
            ? `Pago mixto (${pagosToSubmit
                .map(
                  (p) =>
                    metodosPagoDB.find((m) => m.id === p.metodoPagoId)?.nombre,
                )
                .join(" + ")})`
            : metodosPagoDB.find((m) => m.id === pagosToSubmit[0]?.metodoPagoId)
                ?.nombre || "Efectivo";

        setVentaExitosa({
          items: [...items],
          total: totalFinal,
          metodoPago: nombreMetodoMostrar,
          nroRecibo: Math.random().toString().slice(2, 8).toUpperCase(),
          descuentoMonto: descuentoDetalle.monto,
          promocionNombre: descuentoDetalle.nombre,
        });

        clearCart();
        setCheckoutStep("CART");
        setPromocionId("ninguna");
        setModoMixto(false);
        setIsCuentaCorriente(false);
        setClienteSeleccionado(null);
        closeSidebar();
      } catch (error) {
        console.error("Error al registrar la venta POS:", error);
        toast.error("Ocurrió un error inesperado al registrar la venta.");
      }
    });
  };

  return (
    <>
      {isOpen && (
        <button
          className={`fixed inset-0 bg-black/40 z-40 backdrop-blur-sm transition-opacity ${
            isPosRoute ? "lg:hidden" : ""
          }`}
          onClick={closeSidebar}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-100 bg-card flex flex-col border-l border-border transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0 z-50" : "translate-x-full z-50"
        } ${isPosRoute ? "lg:w-100 lg:z-30 lg:translate-x-0" : ""}`}
      >
        <CartSidebarHeader isPOSMode={isPOSMode} onClose={closeSidebar} />

        {effectiveCheckoutStep === "CART" ? (
          <CartStepItems
            items={items}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            totalCarrito={totalCarrito}
            onContinueToPayment={handleContinueToPayment}
          />
        ) : (
          <CartStepCheckout
            isPOSMode={isPOSMode}
            metodosPagoDB={metodosPagoDB}
            pagos={pagos}
            onPagosChange={setPagos}
            totalFinal={totalFinal}
            isCuentaCorriente={isCuentaCorriente}
            onCuentaCorrienteChange={handleCuentaCorrienteChange}
            modoMixto={modoMixto}
            onModoMixtoChange={setModoMixto}
            anticipoMinimo={anticipoMinimo}
            clienteSeleccionado={clienteSeleccionado}
            onClienteChange={setClienteSeleccionado}
            promocionesElegibles={promocionesElegibles}
            promocionActivaId={promocionActivaId}
            onPromocionChange={setPromocionId}
            onBackToCart={() => setCheckoutStep("CART")}
          >
            {items.length > 0 ? (
              <CartSidebarFooter
                isPOSMode={isPOSMode}
                isPending={isPending}
                totalCarrito={totalCarrito}
                recargoCuentaCorriente={recargoCuentaCorriente}
                totalFinal={totalFinal}
                sumaPagos={sumaPagos}
                isCuentaCorriente={isCuentaCorriente}
                anticipoMinimo={anticipoMinimo}
                clienteSeleccionado={clienteSeleccionado}
                descuentoDetalle={descuentoDetalle}
                whatsappHref={generarLinkWhatsApp({
                  numeroWhatsApp,
                  nombreComercio: branding?.posName,
                  items,
                  total: totalCarrito,
                })}
                metodosPagoDB={metodosPagoDB}
                pagos={pagosSincronizados}
                modoMixto={modoMixto}
                onConfirmarVentaPOS={handleConfirmarVentaPOS}
                onEnviarPedidoWhatsApp={handleEnviarPedidoWhatsApp}
                onClearCart={clearCartAndResetStep}
              />
            ) : null}
          </CartStepCheckout>
        )}
      </div>

      <TicketSheet
        ticket={ventaExitosa}
        config={branding || ({} as ConfiguracionPOS)}
        onClose={() => setVentaExitosa(null)}
      />
    </>
  );
}
