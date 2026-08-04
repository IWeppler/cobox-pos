"use client";

import { TicketData } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// Estilos específicos para el PDF
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 20,
  },
  headerLeft: { flexDirection: "column" },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  subtitle: { fontSize: 10, color: "#64748b" },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  infoBox: { flexDirection: "column" },
  infoTitle: {
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoText: { fontSize: 11, color: "#0f172a", fontWeight: "bold" },
  table: { width: "100%", marginBottom: 30 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 8,
    marginBottom: 8,
  },
  colQty: { width: "10%", fontSize: 10, color: "#64748b", fontWeight: "bold" },
  colDesc: { width: "50%", fontSize: 10, color: "#64748b", fontWeight: "bold" },
  colPrice: {
    width: "20%",
    fontSize: 10,
    color: "#64748b",
    fontWeight: "bold",
    textAlign: "right",
  },
  colTotal: {
    width: "20%",
    fontSize: 10,
    color: "#64748b",
    fontWeight: "bold",
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowText: { fontSize: 11, color: "#334155" },
  rowTextBold: { fontSize: 11, color: "#0f172a", fontWeight: "bold" },
  totalsSection: {
    width: "40%",
    alignSelf: "flex-end",
    flexDirection: "column",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    marginTop: 4,
  },
  totalLabel: { fontSize: 10, color: "#64748b" },
  totalValue: { fontSize: 10, color: "#334155" },
  totalLabelBig: { fontSize: 12, color: "#0f172a", fontWeight: "bold" },
  totalValueBig: { fontSize: 14, color: "#0f172a", fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
  },
  footerText: { fontSize: 9, color: "#94a3b8" },
});

// Componente React-PDF que define la estructura del documento
const ReceiptDocument = ({
  ticket,
  config,
}: {
  ticket: TicketData;
  config: ConfiguracionPOS | null;
}) => {
  const isFiado =
    ticket.estadoPago === "PARCIAL" ||
    (ticket.montoPendiente && ticket.montoPendiente > 0);
  const subtotal = ticket.items.reduce(
    (acc, i) => acc + (i.precioUnitario || i.precio || 0) * i.cantidad,
    0,
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabecera */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>
              {config?.posName?.toUpperCase() || "COMPROBANTE"}
            </Text>
            <Text style={styles.subtitle}>{config?.direccion || ""}</Text>
            {config?.whatsapp && (
              <Text style={styles.subtitle}>Tel: {config.whatsapp}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: "#0f172a",
                marginBottom: 4,
              }}
            >
              COMPROBANTE
            </Text>
            <Text style={styles.subtitle}>Nº #{ticket.nroRecibo}</Text>
            <Text style={styles.subtitle}>
              {ticket.fecha || new Date().toLocaleString("es-AR")}
            </Text>
          </View>
        </View>

        {/* Info del Cliente */}
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Cliente</Text>
            <Text style={styles.infoText}>
              {ticket.clienteNombre || "Consumidor Final"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Condición de Pago</Text>
            <Text style={styles.infoText}>
              {isFiado ? "Cuenta Corriente" : "Contado"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Vendedor</Text>
            <Text style={styles.infoText}>
              {ticket.vendedor || "Administrador"}
            </Text>
          </View>
        </View>

        {/* Tabla de Productos */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colQty}>CANT.</Text>
            <Text style={styles.colDesc}>DESCRIPCIÓN</Text>
            <Text style={styles.colPrice}>P. UNITARIO</Text>
            <Text style={styles.colTotal}>SUBTOTAL</Text>
          </View>

          {ticket.items.map((item, idx) => {
            const pu = item.precioUnitario || item.precio || 0;
            return (
              <View style={styles.tableRow} key={idx}>
                <Text style={[styles.colQty, styles.rowTextBold]}>
                  {item.cantidad}
                </Text>
                <View style={styles.colDesc}>
                  <Text style={styles.rowTextBold}>{item.nombre}</Text>
                  <Text style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                    {item.variante}
                  </Text>
                </View>
                <Text style={[styles.colPrice, styles.rowText]}>
                  ${pu.toLocaleString("es-AR")}
                </Text>
                <Text style={[styles.colTotal, styles.rowTextBold]}>
                  ${(pu * item.cantidad).toLocaleString("es-AR")}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Totales */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.totalValue}>
              ${subtotal.toLocaleString("es-AR")}
            </Text>
          </View>

          {(ticket.descuentoMonto ?? 0) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Desc. ({ticket.promocionNombre}):
              </Text>
              <Text style={styles.totalValue}>
                -${ticket.descuentoMonto?.toLocaleString("es-AR")}
              </Text>
            </View>
          )}

          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelBig}>TOTAL:</Text>
            <Text style={styles.totalValueBig}>
              ${ticket.total.toLocaleString("es-AR")}
            </Text>
          </View>

          {isFiado && (
            <>
              <View style={[styles.totalRow, { marginTop: 10 }]}>
                <Text style={styles.totalLabel}>Anticipo Pagado:</Text>
                <Text style={styles.totalValue}>
                  ${(ticket.montoCobrado || 0).toLocaleString("es-AR")}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text
                  style={[
                    styles.totalLabel,
                    { color: "#b45309", fontWeight: "bold" },
                  ]}
                >
                  Saldo Pendiente:
                </Text>
                <Text
                  style={[
                    styles.totalValue,
                    { color: "#b45309", fontWeight: "bold" },
                  ]}
                >
                  ${(ticket.montoPendiente || 0).toLocaleString("es-AR")}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Footer Legal */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            COMPROBANTE INTERNO - NO VÁLIDO COMO FACTURA FISCAL
          </Text>
          <Text style={[styles.footerText, { marginTop: 4 }]}>
            Generado por Comerz
          </Text>
        </View>
      </Page>
    </Document>
  );
};

// Función maestra que genera y descarga el PDF invisiblemente en 1 segundo
export async function downloadSaleReceiptPdf(
  ticket: TicketData,
  config: ConfiguracionPOS | null,
) {
  try {
    // 1. Generamos el Blob del PDF directamente en memoria
    const blob = await pdf(
      <ReceiptDocument ticket={ticket} config={config} />,
    ).toBlob();

    // 2. Creamos una URL temporal
    const url = URL.createObjectURL(blob);

    // 3. Forzamos la descarga nativa del navegador
    const link = document.createElement("a");
    link.href = url;
    link.download = `Comprobante_${ticket.nroRecibo}.pdf`;
    document.body.appendChild(link);
    link.click();

    // 4. Limpiamos la basura
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error("Error generando PDF con react-pdf:", error);
    return false;
  }
}
