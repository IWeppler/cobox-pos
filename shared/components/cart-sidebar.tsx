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
import { CartSidebarBody } from "./cart-sidebar/cart-sidebar-body";
import { CartSidebarFooter } from "./cart-sidebar/cart-sidebar-footer";
import { CartSidebarHeader } from "./cart-sidebar/cart-sidebar-header";
import { PromocionDB } from "./cart-sidebar/types";

const subscribeToClientMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

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

  const [promocionesDB, setPromocionesDB] = useState<PromocionDB[]>([]);
  const [promocionId, setPromocionId] = useState("ninguna");
  const [ventaExitosa, setVentaExitosa] = useState<TicketData | null>(null);

  const isPOSMode = isAdmin;
  const totalCarrito = getTotalPrice();

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
      (event, session) => {
        if (isMounted) setIsAdmin(!!session);
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const promocionesElegibles = useMemo(() => {
    return promocionesDB.filter((promo) => {
      if (promo.monto_minimo && totalCarrito < promo.monto_minimo) {
        return false;
      }

      if (promo.tipo_regla === "METODO_PAGO") {
        const metodosPromo =
          promo.promociones_metodos_pago?.map((m) => m.metodo_pago) || [];

        // Obtenemos los 'tipos' (EFECTIVO, TARJETA) de todos los métodos seleccionados actualmente
        const selectedTipos = pagos.map(
          (p) => metodosPagoDB.find((m) => m.id === p.metodoPagoId)?.tipo,
        );

        if (selectedTipos.length === 0) return false;

        // ESTRICTO: Para aplicar una promo de pago, TODOS los métodos divididos deben cumplir la regla
        const allValid = selectedTipos.every(
          (t) => t && metodosPromo.includes(t),
        );

        if (!allValid) return false;
      }

      if (promo.tipo_regla === "CATEGORIA") {
        const categorias =
          promo.promociones_categorias?.map((c) =>
            c.categoria_nombre.toLowerCase(),
          ) || [];
        const hasCategory = items.some((item) =>
          categorias.includes(item.tipo.toLowerCase()),
        );

        if (!hasCategory) return false;
      }

      return true;
    });
  }, [promocionesDB, totalCarrito, pagos, items, metodosPagoDB]);

  const promocionActivaId = useMemo(() => {
    if (promocionId === "ninguna") return "ninguna";
    return promocionesElegibles.some((promo) => promo.id === promocionId)
      ? promocionId
      : "ninguna";
  }, [promocionesElegibles, promocionId]);

  const descuentoDetalle = useMemo(() => {
    if (promocionActivaId === "ninguna") return { monto: 0, nombre: "" };

    const promo = promocionesElegibles.find(
      (item) => item.id === promocionActivaId,
    );
    if (!promo) return { monto: 0, nombre: "" };

    let montoBase = totalCarrito;

    if (promo.tipo_regla === "CATEGORIA") {
      const categorias =
        promo.promociones_categorias?.map((c) =>
          c.categoria_nombre.toLowerCase(),
        ) || [];
      montoBase = items.reduce((acc, item) => {
        if (categorias.includes(item.tipo.toLowerCase())) {
          return acc + item.precio * item.cantidad;
        }
        return acc;
      }, 0);
    }

    let descuento = 0;
    if (promo.tipo_descuento === "PORCENTAJE") {
      descuento = (montoBase * promo.valor_descuento) / 100;
    } else {
      descuento = promo.valor_descuento;
    }

    if (descuento > totalCarrito) descuento = totalCarrito;

    return { monto: Math.round(descuento), nombre: promo.nombre };
  }, [promocionActivaId, promocionesElegibles, totalCarrito, items]);

  const totalFinal = totalCarrito - descuentoDetalle.monto;

  // 'pagosConTotal' is declared but its value is never read.ts(6133)
  // 'pagosConTotal' is assigned a value but never used.
  const pagosConTotal = useMemo(() => {
    if (metodosPagoDB.length === 0) return pagos;
    if (pagos.length > 1) return pagos;

    return [
      {
        metodoPagoId: pagos[0]?.metodoPagoId || metodosPagoDB[0].id,
        montoAsignado: totalFinal,
      },
    ];
  }, [pagos, metodosPagoDB, totalFinal]);

  if (!mounted) return null;

  const handleContinueShopping = () => {
    setIsOpen(false);
    router.push(isPOSMode ? "/stock" : "/store");
  };

  const generarLinkWhatsApp = () => {
    if (!numeroWhatsApp) return "#";
    let mensaje =
      "Hola Vivero Tostado!\nQuiero realizar el siguiente pedido:\n\n";

    items.forEach((item) => {
      mensaje += `${item.cantidad}x ${item.nombre} (${item.tipo})\n`;
      mensaje += ` - Talle: ${item.variante} - $${(
        item.precio * item.cantidad
      ).toLocaleString("es-AR")}\n`;
    });

    mensaje += `\nTOTAL: $${getTotalPrice().toLocaleString(
      "es-AR",
    )}\n\nTienen stock disponible para confirmar?`;
    return `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(
      mensaje,
    )}`;
  };

  const handleEnviarPedidoWhatsApp = () => {
    setTimeout(() => {
      clearCart();
      setIsOpen(false);
    }, 1000);
  };

  const handleConfirmarVentaPOS = () => {
    const sumaPagos = pagos.reduce(
      (acc, p) => acc + Number(p.montoAsignado),
      0,
    );
    if (Math.abs(sumaPagos - totalFinal) > 0.05) {
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

        const formData = new FormData();
        formData.append("cart_items", JSON.stringify(items));
        formData.append("pagos", JSON.stringify(pagos));
        formData.append("metodo_pago_id", pagos[0].metodoPagoId);

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
                  setIsOpen(false);
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

        // Preparar el ticket visual con soporte para nombre mixto
        const nombreMetodoMostrar =
          pagos.length > 1
            ? `Pago mixto (${pagos.map((p) => metodosPagoDB.find((m) => m.id === p.metodoPagoId)?.nombre).join(" + ")})`
            : metodosPagoDB.find((m) => m.id === pagos[0].metodoPagoId)
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
        setPromocionId("ninguna");
        setIsOpen(false);
      } catch (error) {
        console.error("Error al registrar la venta POS:", error);
        toast.error("Ocurrió un error inesperado al registrar la venta.");
      }
    });
  };

  return (
    <>
      {/* OVERLAY: Se oculta en POS de escritorio (lg:hidden) */}
      {isOpen && (
        <button
          className={`fixed inset-0 bg-black/40 z-30 backdrop-blur-sm transition-opacity ${
            isPosRoute ? "lg:hidden" : ""
          }`}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-100 bg-card flex flex-col border-l border-border transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0 z-50" : "translate-x-full z-50"
        } ${isPosRoute ? "lg:w-100 lg:z-30 lg:translate-x-0" : ""}`}
      >
        <CartSidebarHeader
          isPOSMode={isPOSMode}
          onClose={() => setIsOpen(false)}
        />

        <CartSidebarBody
          items={items}
          isPOSMode={isPOSMode}
          isPending={isPending}
          metodosPagoDB={metodosPagoDB}
          pagos={pagos}
          onPagosChange={setPagos}
          totalFinal={totalFinal}
          promocionesElegibles={promocionesElegibles}
          promocionActivaId={promocionActivaId}
          onContinueShopping={handleContinueShopping}
          onRemoveItem={removeItem}
          onUpdateQuantity={updateQuantity}
          onPromocionChange={setPromocionId}
        />

        {items.length > 0 && (
          <CartSidebarFooter
            isPOSMode={isPOSMode}
            isPending={isPending}
            totalCarrito={totalCarrito}
            totalFinal={totalFinal}
            descuentoDetalle={descuentoDetalle}
            whatsappHref={generarLinkWhatsApp()}
            onConfirmarVentaPOS={handleConfirmarVentaPOS}
            onEnviarPedidoWhatsApp={handleEnviarPedidoWhatsApp}
            onClearCart={clearCart}
          />
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
