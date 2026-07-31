import { TicketData } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";
import {
  formatTicketMoney,
  getTicketFinancialSummary,
  getTicketSubtotal,
} from "./ticket-utils";

interface TicketPrintableProps {
  ticket: TicketData | null;
  config: ConfiguracionPOS | null;
}

export function TicketPrintable({
  ticket,
  config,
}: Readonly<TicketPrintableProps>) {
  const nombreComercio = config?.posName || "Mi Comercio";
  const direccionComercio = config?.direccion || "Sin direccion";
  const whatsappComercio = config?.whatsapp || "";
  const mensajeDespedida = config?.mensaje_ticket || "Gracias por su compra!";
  const subtotalCarrito = getTicketSubtotal(ticket);
  const { esFiado, montoCobrado, montoPendiente, pagosDesglosados } =
    getTicketFinancialSummary(ticket);

  return (
    <div id="ticket-print-wrapper" className="hidden">
      <div className="bg-white text-black p-5 font-mono leading-relaxed">
        <div className="text-center pb-4 border-b-2 border-dashed border-gray-400">
          <h2 className="text-xl font-bold uppercase tracking-widest mb-1">
            {nombreComercio}
          </h2>
          <p className="text-xs text-gray-700">{direccionComercio}</p>
          {whatsappComercio && (
            <p className="text-xs text-gray-700">
              WhatsApp: {whatsappComercio}
            </p>
          )}
        </div>

        <div className="py-3 border-b-2 border-dashed border-gray-400 space-y-1 text-sm">
          <p>
            Comprobante{" "}
            <span className="font-bold">#{ticket?.nroRecibo}</span>
          </p>
          <p>
            {ticket?.fecha ||
              new Date().toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
          </p>
          <p>Vend: {ticket?.vendedor || "Administrador"}</p>
          <p>Cliente: {ticket?.clienteNombre || "Consumidor final"}</p>
        </div>

        <div className="py-4 border-b-2 border-dashed border-gray-400 space-y-3">
          {ticket?.items.map((item, idx) => {
            const precioUnitario = item.precioUnitario || item.precio || 0;
            const totalItem = precioUnitario * item.cantidad;
            return (
              <div key={idx} className="flex flex-col">
                <p className="font-bold uppercase leading-tight text-sm">
                  {item.cantidad}x {item.nombre}{" "}
                  {item.variante && `(${item.variante})`}
                </p>
                {/* El IMEI va en el ticket porque es el comprobante con el
                    que el cliente reclama la garantía del aparato. */}
                {item.imei && (
                  <p className="font-mono text-[10px] leading-tight text-gray-700">
                    IMEI: {item.imei}
                  </p>
                )}
                <div className="flex justify-between items-center text-gray-700 text-xs mt-0.5">
                  <span>{formatTicketMoney(precioUnitario)} c/u</span>
                  <span className="font-bold text-black text-sm">
                    {formatTicketMoney(totalItem)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="py-3 border-b-2 border-dashed border-gray-400 space-y-1.5 text-sm">
          <div className="flex justify-between items-center">
            <span>Subtotal</span>
            <span>{formatTicketMoney(subtotalCarrito)}</span>
          </div>

          {(ticket?.descuentoMonto ?? 0) > 0 && (
            <div className="flex justify-between items-center text-gray-700">
              <span className="truncate pr-2">
                Desc. ({ticket?.promocionNombre})
              </span>
              <span>-{formatTicketMoney(ticket?.descuentoMonto)}</span>
            </div>
          )}

          {(ticket?.recargoMetodoMonto ?? 0) > 0 && (
            <div className="flex justify-between items-center text-gray-700">
              <span className="truncate pr-2">
                {ticket?.recargoMetodoEtiqueta || "Recargo método de pago"}
              </span>
              <span>+{formatTicketMoney(ticket?.recargoMetodoMonto)}</span>
            </div>
          )}

          <div className="flex justify-between items-center font-semibold text-base pt-2 mt-2 border-t border-gray-300">
            <span>TOTAL</span>
            <span>{formatTicketMoney(ticket?.total)}</span>
          </div>

          <div className="pt-2 mt-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
              {esFiado ? "Cuenta corriente" : "Medios de pago"}
            </p>
            {esFiado ? (
              <>
                <div className="flex justify-between text-xs font-bold uppercase">
                  <span>Anticipo</span>
                  <span>{formatTicketMoney(montoCobrado)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold uppercase">
                  <span>Saldo</span>
                  <span>{formatTicketMoney(montoPendiente)}</span>
                </div>
              </>
            ) : pagosDesglosados.length > 0 ? (
              pagosDesglosados.map((p, idx) => (
                <div
                  key={`${p.nombre}-print-${idx}`}
                  className="flex justify-between text-xs font-bold uppercase"
                >
                  <span>{p.nombre}</span>
                  <span>{formatTicketMoney(p.monto)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs uppercase font-bold">
                {ticket?.metodoPago}
              </p>
            )}
          </div>
        </div>

        <div className="text-center pt-4 text-xs space-y-1">
          <p className="font-bold">{mensajeDespedida}</p>
          <p className="text-gray-500">Documento no valido como factura</p>
        </div>
      </div>
    </div>
  );
}
