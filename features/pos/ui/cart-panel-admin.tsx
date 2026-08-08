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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registrarVentaAction } from "@/features/sales/actions/create-sale";
import { getDisponibilidadUnidadesAction } from "@/features/sales/actions/get-unidades-serie";
import { SeleccionarUnidadesModal } from "./seleccionar-unidades-modal";
import type {
  DisponibilidadPorVariante,
  UnidadSeleccionada,
} from "@/entities/ventas/unidades-serie-types";
import { crearReservaAction } from "@/features/reservations/actions/manage-reservations";
import { TicketSheet } from "@/features/sales/ui/ticket-sheet";
import { TicketData, CreateSalePaymentInput } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";
import { formatearNumeroComprobante } from "@/shared/lib/facturacion";
import { MetodoPago } from "@/entities/payments/types";
import { CartSidebarFooter } from "../../../shared/components/cart-sidebar/cart-sidebar-footer";
import { CartSidebarHeader } from "../../../shared/components/cart-sidebar/cart-sidebar-header";
import { CartStepCheckout } from "../../../shared/components/cart-sidebar/cart-step-checkout";
import { CartStepItems } from "../../../shared/components/cart-sidebar/cart-step-items";
import { Sheet, SheetContent } from "@/shared/ui/sheet";
import { Drawer, DrawerContent } from "@/shared/ui/drawer";
import { MobileCartBar } from "../../../shared/components/cart-sidebar/mobile-cart-bar";
import { PromocionDB } from "../../../shared/components/cart-sidebar/types";
import {
  generarLinkWhatsApp,
  getDescuentoDetalle,
  getPromocionActivaId,
  getPromocionesElegibles,
} from "../../../shared/components/cart-sidebar/cart-sidebar-utils";
import { ClienteBasico } from "../../../shared/components/cart-sidebar/client-selector";
import {
  calcularPagosConRecargo,
  etiquetaRecargo,
} from "@/shared/lib/recargo-metodo";

const subscribeToClientMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
type CheckoutStep = "CART" | "PAYMENT";

export function CartPanelAdmin({
  numeroWhatsApp,
}: Readonly<{ numeroWhatsApp?: string }>) {
  const {
    items,
    isOpen,
    setIsOpen,
    removeItem,
    updateQuantity,
    getTotalPrice,
    getTotalItems,
    clearCart,
  } = useCartStore(
    useShallow((state) => ({
      items: state.items,
      isOpen: state.isOpen,
      setIsOpen: state.setIsOpen,
      removeItem: state.removeItem,
      updateQuantity: state.updateQuantity,
      getTotalPrice: state.getTotalPrice,
      getTotalItems: state.getTotalItems,
      clearCart: state.clearCart,
    })),
  );

  const router = useRouter();

  // --- UNIDADES SERIALIZADAS (IMEI / número de serie) ---
  // `variantesSerializadas` son las variantes del carrito que tienen al
  // menos una unidad libre en unidades_serie: esas líneas no se pueden
  // cobrar sin elegir el aparato. Se recalcula cuando cambia el carrito.
  // Para un catálogo sin unidades_serie (toda la indumentaria) esto queda
  // vacío y no cambia absolutamente nada del flujo.
  // Resultado crudo de la última consulta. `variantesSerializadas` se deriva
  // de acá cruzándolo con el carrito actual, en vez de resetearse por efecto:
  // si el carrito se vacía, el memo ya da un Set vacío sin escribir estado.
  const [disponibilidadUnidades, setDisponibilidadUnidades] =
    useState<DisponibilidadPorVariante>({});
  const [unidadesElegidasRaw, setUnidadesElegidasRaw] = useState<
    UnidadSeleccionada[]
  >([]);
  // Dos formas de llegar al selector, y no hacen lo mismo: desde el carrito
  // se elige y se vuelve al carrito; desde "Confirmar venta" se elige y se
  // retoma el cobro donde había quedado. Por eso es modo y no un booleano.
  const [modalUnidades, setModalUnidades] = useState<
    "SOLO_ELEGIR" | "CONFIRMAR" | null
  >(null);
  /** El anticipo tipeado en el modal de CC se guarda mientras el vendedor
   * elige los aparatos, para retomar la confirmación con el mismo monto. */
  const [anticipoPendiente, setAnticipoPendiente] = useState<
    number | undefined
  >(undefined);

  const varianteIdsCarrito = useMemo(
    () =>
      items
        .map((i) => i.varianteId)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join(","),
    [items],
  );

  useEffect(() => {
    const ids = varianteIdsCarrito ? varianteIdsCarrito.split(",") : [];
    if (ids.length === 0) return;

    let cancelado = false;
    getDisponibilidadUnidadesAction(ids).then((res) => {
      // Guard de carrera: si el carrito cambió mientras volvía la consulta,
      // esta respuesta ya no corresponde y se descarta.
      if (cancelado) return;
      setDisponibilidadUnidades(res.disponibilidad);
    });

    return () => {
      cancelado = true;
    };
  }, [varianteIdsCarrito]);

  const variantesSerializadas = useMemo(() => {
    const enCarrito = new Set(
      varianteIdsCarrito ? varianteIdsCarrito.split(",") : [],
    );
    return new Set(
      Object.entries(disponibilidadUnidades)
        .filter(([varianteId, cantidad]) => cantidad > 0 && enCarrito.has(varianteId))
        .map(([varianteId]) => varianteId),
    );
  }, [disponibilidadUnidades, varianteIdsCarrito]);

  // Una unidad elegida deja de valer si esa línea salió del carrito. Se
  // filtra al leer en vez de limpiarse por efecto, para no encadenar un
  // render extra cada vez que cambia el carrito.
  const unidadesElegidas = useMemo(
    () =>
      unidadesElegidasRaw.filter((u) => variantesSerializadas.has(u.varianteId)),
    [unidadesElegidasRaw, variantesSerializadas],
  );

  const lineasSerializadas = useMemo(
    () =>
      items
        .filter((i) => i.varianteId && variantesSerializadas.has(i.varianteId))
        .map((i) => ({
          varianteId: i.varianteId as string,
          nombre: i.nombre,
          variante: i.variante,
        })),
    [items, variantesSerializadas],
  );

  const imeiPorVariante = useMemo(
    () =>
      Object.fromEntries(unidadesElegidas.map((u) => [u.varianteId, u.imei])),
    [unidadesElegidas],
  );



  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [isPending, startTransition] = useTransition();

  const [branding, setBranding] = useState<ConfiguracionPOS | null>(null);
  const [vendedorNombre, setVendedorNombre] = useState("Tú");
  const [metodosPagoDB, setMetodosPagoDB] = useState<MetodoPago[]>([]);
  const [pagos, setPagos] = useState<CreateSalePaymentInput[]>([]);
  const [modoMixto, setModoMixto] = useState(false);
  const [isCuentaCorriente, setIsCuentaCorriente] = useState(false);
  /** La vendedora anuló el recargo CC para ESTE ticket. No persiste entre
   * ventas: se resetea al cerrar la venta y al apagar Cuenta Corriente. */
  const [ccSinRecargo, setCcSinRecargo] = useState(false);
  const [isReserva, setIsReserva] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  // Corte propio para celular (<640px, Tailwind `sm`) — distinto del corte
  // mobile/desktop de arriba (1024px). Tablet (640-1023px) sigue exactamente
  // igual que hoy: sheet lateral + auto-apertura vía `isOpen` del store.
  // Celular usa su propia barra fija + Drawer inferior, con apertura
  // controlada solo por el tap del usuario (nunca por agregar un producto).
  const [isPhoneLayout, setIsPhoneLayout] = useState(false);
  const [phoneCartOpen, setPhoneCartOpen] = useState(false);

  const [promocionesDB, setPromocionesDB] = useState<PromocionDB[]>([]);
  const [promocionId, setPromocionId] = useState("ninguna");
  const [ventaExitosa, setVentaExitosa] = useState<TicketData | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("CART");
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<ClienteBasico | null>(null);

  const isPOSMode = true;
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
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateLayout = () => setIsPhoneLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const checkUserAndFetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (session) {
        const { data: perfil } = await supabase
          .from("perfiles")
          .select("nombre")
          .eq("id", session.user.id)
          .maybeSingle();
        const metadata = session.user.user_metadata;
        setVendedorNombre(
          perfil?.nombre ||
            metadata?.nombre ||
            metadata?.name ||
            metadata?.full_name ||
            session.user.email?.split("@")[0] ||
            "Tú",
        );

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
          .select("id, nombre, tipo, comision, recargo_porcentaje")
          .eq("activo", true)
          .order("comision", { ascending: true });

        if (metodos) {
          setMetodosPagoDB(metodos as unknown as MetodoPago[]);
        }
      }
    };

    checkUserAndFetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const promocionesElegibles = useMemo(() => {
    return getPromocionesElegibles({
      promociones: promocionesDB,
      totalCarrito,
      pagos,
      items,
      metodosPago: metodosPagoDB,
      canal: "POS",
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
  // Lo que el recargo CC sería si se aplicara. Se calcula igual esté anulado
  // o no: es lo que el footer necesita para poder ofrecer "restaurar".
  const recargoCuentaCorrientePotencial = isCuentaCorriente
    ? (subtotalConDescuento * (branding?.cc_recargo_default || 0)) / 100
    : 0;
  const recargoCuentaCorriente = ccSinRecargo
    ? 0
    : recargoCuentaCorrientePotencial;

  const totalFinal = subtotalConDescuento + recargoCuentaCorriente;
  const clienteExceptuadoEntregaMinima =
    clienteSeleccionado?.exceptuado_entrega_minima ?? false;
  const anticipoMinimo =
    isCuentaCorriente && !clienteExceptuadoEntregaMinima
      ? (totalFinal * (branding?.cc_anticipo_default || 0)) / 100
      : 0;
  const firstPagoId = pagos[0]?.metodoPagoId;

  // En Cuenta Corriente no caemos al primer método de la lista si el
  // usuario todavía no eligió ninguno — este es el valor que efectivamente
  // se manda al backend (ver pagosToSubmit más abajo), así que sin este
  // guard el fix de "no autocompletar" en CartStepCheckout sería solo
  // cosmético: la venta igual se registraría con un método que nadie
  // eligió.
  const metodoPagoRapidoId =
    firstPagoId || (isCuentaCorriente ? "" : metodosPagoDB[0]?.id || "");
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

  // Recargo por método: se recalcula cada vez que cambia el método elegido o
  // el reparto del pago mixto, porque el total a cobrar depende de CÓMO se
  // paga. `sumaPagos` sigue siendo la suma de bases (lo que cubre el ticket);
  // el recargo va aparte y se suma recién en `totalACobrar`. El server
  // recalcula lo mismo con los % de la base — este número es solo para que la
  // vendedora vea antes de cobrar lo que se va a persistir.
  const recargoMetodo = useMemo(
    () => calcularPagosConRecargo(pagosSincronizados, metodosPagoDB),
    [pagosSincronizados, metodosPagoDB],
  );
  const recargoMetodoEtiqueta = useMemo(
    () => etiquetaRecargo(recargoMetodo.pagos, metodosPagoDB),
    [recargoMetodo, metodosPagoDB],
  );
  const totalACobrar = totalFinal + recargoMetodo.totalRecargo;

  // 🚀 FIX: AUTO-SYNC DE PAGOS (Garantiza que el cajero nunca vea "$4.248 de $4.720")
  if (!mounted) return null;

  const closeSidebar = () => {
    setCheckoutStep("CART");
    setIsOpen(false);
    setPhoneCartOpen(false);
  };

  const clearCartAndResetStep = () => {
    clearCart();
    setCheckoutStep("CART");
  };

  const handleCuentaCorrienteChange = (value: boolean) => {
    setIsCuentaCorriente(value);
    // Apagar CC descarta la exención: si se vuelve a prender, arranca con el
    // recargo puesto. Anularlo tiene que ser siempre un acto explícito.
    if (!value) setCcSinRecargo(false);
    if (value) {
      setIsReserva(false);
      setPromocionId("ninguna");
    }
  };

  const handleReservaChange = (value: boolean) => {
    setIsReserva(value);
    if (value) {
      setIsCuentaCorriente(false);
      setPromocionId("ninguna");
    }
  };

  const handleConfirmarReserva = () => {
    if (!clienteSeleccionado) {
      toast.error("Selecciona un cliente para reservar.");
      return;
    }
    if (items.some((item) => !item.varianteId)) {
      toast.error(
        "Alguno de los productos no tiene variante registrada y no se puede reservar.",
      );
      return;
    }

    startTransition(async () => {
      const result = await crearReservaAction(
        clienteSeleccionado.id,
        items.map((item) => ({
          productoId: item.productoId,
          varianteId: item.varianteId,
          cantidad: item.cantidad,
        })),
      );

      if (!result.success) {
        toast.error("No se pudo registrar la reserva.", {
          description: result.error ?? "Intenta nuevamente.",
        });
        return;
      }

      toast.success("Reserva registrada.");
      clearCartAndResetStep();
      setPromocionId("ninguna");
      setModoMixto(false);
      setIsReserva(false);
      setClienteSeleccionado(null);
      closeSidebar();
    });
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

  const handleConfirmarVentaPOS = (
    montoAnticipoModal?: number,
    // La selección del modal llega por argumento y no por estado: al salir
    // del modal, este closure todavía vería `unidadesElegidas` vacío y la
    // venta saldría sin aparatos.
    unidadesOverride?: UnidadSeleccionada[],
  ) => {
    const montoRealAsignado =
      montoAnticipoModal !== undefined ? montoAnticipoModal : sumaPagos;

    const unidadesParaVenta = unidadesOverride ?? unidadesElegidas;
    const imeisParaVenta = Object.fromEntries(
      unidadesParaVenta.map((u) => [u.varianteId, u.imei]),
    );

    // Antes que cualquier otra validación: si hay líneas serializadas sin
    // aparato elegido, se abre el modal y no se cobra nada. El server hace
    // el mismo chequeo (esto es solo la UX; la regla vive en create-sale).
    if (lineasSerializadas.some((l) => !imeisParaVenta[l.varianteId])) {
      setAnticipoPendiente(montoAnticipoModal);
      setModalUnidades("CONFIRMAR");
      return;
    }

    if (isCuentaCorriente && !clienteSeleccionado) {
      toast.error("Selecciona un cliente para Cuenta Corriente.");
      return;
    }

    if (
      isCuentaCorriente &&
      montoRealAsignado + 0.05 < anticipoMinimo &&
      branding?.entrega_minima_bloqueante
    ) {
      toast.error("Este cliente requiere al menos una entrega mínima.", {
        description: `Mínimo: $${anticipoMinimo.toLocaleString("es-AR")}`,
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

        // 🚀 ARMAMOS LOS PAGOS DEFINITIVOS PARA EL BACKEND
        let pagosToSubmit = [...pagosSincronizados];
        if (isCuentaCorriente && montoAnticipoModal !== undefined) {
          // Tomamos el método de pago seleccionado y le asignamos el anticipo tipeado
          pagosToSubmit = [
            { ...pagosSincronizados[0], montoAsignado: montoAnticipoModal },
          ];
        }

        // El anticipo tipeado en el modal cambia la base, así que el recargo
        // del ticket se recalcula sobre los pagos DEFINITIVOS, no sobre los
        // que se estaban mostrando en el panel.
        const recargoSubmit = calcularPagosConRecargo(
          pagosToSubmit,
          metodosPagoDB,
        );

        const formData = new FormData();
        formData.append("cart_items", JSON.stringify(items));
        formData.append("pagos", JSON.stringify(pagosToSubmit));
        formData.append("metodo_pago_id", pagosToSubmit[0]?.metodoPagoId || "");
        formData.append("is_cuenta_corriente", String(isCuentaCorriente));
        formData.append("recargo_cc", String(recargoCuentaCorriente));
        formData.append("cc_sin_recargo", String(ccSinRecargo));

        if (clienteSeleccionado) {
          formData.append("cliente_id", clienteSeleccionado.id);
        }

        // Solo las unidades de líneas que siguen en el carrito. El server
        // vuelve a validar cuáles corresponden y rechaza las que no.
        if (unidadesParaVenta.length > 0) {
          formData.append(
            "unidades_serie",
            JSON.stringify(
              unidadesParaVenta.map((u) => ({
                varianteId: u.varianteId,
                unidadId: u.unidadId,
              })),
            ),
          );
        }

        const reservaIds = items.flatMap((item) => item.reservaIds ?? []);
        if (reservaIds.length > 0) {
          formData.append("reserva_ids", JSON.stringify(reservaIds));
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

        // El correlativo emitido es el número real del comprobante. Si la
        // emisión falló, el ticket cae al identificador de la venta — que es
        // lo que se imprimía antes de que existieran los comprobantes, así
        // que la vendedora nunca se queda sin nada que decirle al cliente.
        const idReal =
          formatearNumeroComprobante(
            result.comprobante?.puntoVenta,
            result.comprobante?.numero,
          ) ?? result.ventaId.split("-")[0].toUpperCase();
        const montoPendiente = isCuentaCorriente
          ? Math.max(0, totalFinal - montoRealAsignado)
          : 0;
        const estadoVenta = isCuentaCorriente
          ? montoRealAsignado > 0
            ? "PARCIAL"
            : "PENDIENTE"
          : "PAGADA";

        setVentaExitosa({
          // El IMEI viaja al ticket recién impreso: es el comprobante de
          // garantía del aparato que el cliente se acaba de llevar.
          items: items.map((item) => ({
            ...item,
            imei: item.varianteId
              ? (imeisParaVenta[item.varianteId] ?? null)
              : null,
          })),
          total: totalFinal + recargoSubmit.totalRecargo,
          metodoPago: nombreMetodoMostrar,
          nroRecibo: idReal,
          descuentoMonto: descuentoDetalle.monto,
          promocionNombre: descuentoDetalle.nombre,
          recargoMetodoMonto: recargoSubmit.totalRecargo,
          recargoMetodoEtiqueta: etiquetaRecargo(
            recargoSubmit.pagos,
            metodosPagoDB,
          ),
          vendedor: vendedorNombre || "Tú",
          clienteNombre: clienteSeleccionado?.nombre || "Consumidor final",
          estadoPago: estadoVenta,
          montoPendiente,
          montoCobrado: montoRealAsignado + recargoSubmit.totalRecargo,
          esFiadoDirecto: isCuentaCorriente,
        });

        clearCart();
        setCheckoutStep("CART");
        setPromocionId("ninguna");
        setModoMixto(false);
        setIsCuentaCorriente(false);
        setCcSinRecargo(false);
        setClienteSeleccionado(null);
        closeSidebar();
      } catch (error) {
        console.error("Error al registrar la venta POS:", error);
        toast.error("Ocurrió un error inesperado al registrar la venta.");
      }
    });
  };

  const CartContent = (
    <>
      <CartSidebarHeader isPOSMode={isPOSMode} onClose={closeSidebar} />

      {effectiveCheckoutStep === "CART" ? (
        <CartStepItems
          items={items}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={removeItem}
          totalCarrito={totalCarrito}
          onContinueToPayment={handleContinueToPayment}
          variantesSerializadas={variantesSerializadas}
          imeiPorVariante={imeiPorVariante}
          onElegirUnidad={() => setModalUnidades("SOLO_ELEGIR")}
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
          isReserva={isReserva}
          onReservaChange={handleReservaChange}
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
              recargoCuentaCorrientePotencial={recargoCuentaCorrientePotencial}
              ccSinRecargo={ccSinRecargo}
              onCcSinRecargoChange={setCcSinRecargo}
              recargoMetodoMonto={recargoMetodo.totalRecargo}
              recargoMetodoEtiqueta={recargoMetodoEtiqueta}
              totalFinal={totalFinal}
              totalACobrar={totalACobrar}
              sumaPagos={sumaPagos}
              isCuentaCorriente={isCuentaCorriente}
              isReserva={isReserva}
              onConfirmarReserva={handleConfirmarReserva}
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
    </>
  );

  return (
    <>
      <div className="hidden lg:flex flex-col w-100 shrink-0 border-l border-border bg-background h-full z-20">
        {CartContent}
      </div>

      {/* Tablet (640-1023px): sin cambios — sheet lateral derecho, se sigue
          abriendo solo por `isOpen` del store (auto-apertura al agregar). */}
      <Sheet
        open={isMobileLayout && !isPhoneLayout && isOpen}
        onOpenChange={setIsOpen}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="lg:hidden w-full sm:max-w-sm gap-0 p-0"
        >
          {CartContent}
        </SheetContent>
      </Sheet>

      {/* Celular (<640px): barra fija inferior con total + contador —
          agregar un producto solo actualiza esta barra, nunca abre el
          Drawer. Solo se muestra con el carrito no vacío. */}
      {isPhoneLayout && items.length > 0 && !phoneCartOpen && (
        <MobileCartBar
          totalItems={getTotalItems()}
          totalPrice={totalCarrito}
          onOpen={() => setPhoneCartOpen(true)}
        />
      )}

      <Drawer
        direction="bottom"
        open={isPhoneLayout && phoneCartOpen}
        onOpenChange={(open) => {
          if (open) setPhoneCartOpen(true);
          else closeSidebar();
        }}
      >
        <DrawerContent>{CartContent}</DrawerContent>
      </Drawer>

      {/* Montado solo cuando está abierto: así arranca con estado limpio y
          la carga de unidades ocurre en el montaje, sin resets por efecto. */}
      {modalUnidades && (
        <SeleccionarUnidadesModal
          onCerrar={() => setModalUnidades(null)}
          lineas={lineasSerializadas}
          onConfirmar={(seleccion) => {
            const modo = modalUnidades;
            setUnidadesElegidasRaw(seleccion);
            setModalUnidades(null);
            // Abierto desde el carrito: se guarda el aparato y listo, nadie
            // pidió cobrar todavía.
            if (modo !== "CONFIRMAR") return;
            // La selección va por argumento: el estado de arriba todavía no
            // se aplicó en este closure.
            handleConfirmarVentaPOS(anticipoPendiente, seleccion);
          }}
        />
      )}

      <TicketSheet
        ticket={ventaExitosa}
        config={branding || ({} as ConfiguracionPOS)}
        onClose={() => setVentaExitosa(null)}
      />
    </>
  );
}
