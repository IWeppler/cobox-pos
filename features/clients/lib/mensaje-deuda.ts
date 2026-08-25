export type DatosMensajeDeuda = {
  nombreCliente: string;
  /** Lo que figura en `clientes.saldo_pendiente`, sin recargo por mora. */
  saldo: number;
  /** Recargo por mora ya devengado. 0 si no hay. */
  montoRecargo: number;
  /** Saldo + recargo: lo que el sistema va a cobrar si paga hoy. */
  saldoConRecargo: number;
  /** ISO de vencimiento, o null si no tiene. */
  fechaVencimiento: string | null;
  /** Días vencido (positivo) o null si no venció / no aplica. */
  diasVencido: number | null;
  /** Link al resumen completo. Sin él el mensaje sale igual, sin detalle. */
  urlResumen?: string | null;
  nombreComercio?: string | null;
};

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}` : iso;
}

/**
 * El texto del recordatorio de deuda que se manda por WhatsApp.
 *
 * Es CORTO a propósito, y el detalle viaja como LINK.
 *
 * La versión anterior metía los últimos movimientos adentro del mensaje y no
 * alcanzaba: o quedaba incompleto —¿cuántos movimientos entran antes de que
 * nadie lo lea?— o se volvía un chorizo. Y mandar un PDF adjunto es peor: son
 * cinco pasos desde el celular (descargar, abrir WhatsApp, buscar el contacto,
 * adjuntar, encontrar el archivo), o sea que se hace una vez y se abandona.
 *
 * Con link, el detalle es completo sin importar cuántos movimientos haya, y
 * además se mantiene VIVO: si la clienta paga y vuelve a abrirlo ve que está
 * al día, en vez de una foto congelada que la contradice.
 *
 * EL TOTAL ES EL QUE SE VA A COBRAR. Si hay recargo por mora devengado va
 * desglosado: mandar el saldo pelado y después cobrar más es la forma más
 * rápida de tener una discusión en el mostrador. Sale de la misma función que
 * usa el cobro.
 *
 * La función es pura y devuelve texto plano: el `*` de WhatsApp es negrita en
 * el celular de quien lo recibe.
 */
export function construirMensajeDeuda(datos: DatosMensajeDeuda): string {
  const {
    nombreCliente,
    saldo,
    montoRecargo,
    saldoConRecargo,
    fechaVencimiento,
    diasVencido,
    urlResumen,
    nombreComercio,
  } = datos;

  const primerNombre = nombreCliente.trim().split(/\s+/)[0] || nombreCliente;
  const lineas: string[] = [`Hola ${primerNombre}, ¿cómo estás?`];

  const deQuien = nombreComercio?.trim();
  lineas.push(
    deQuien
      ? `Te escribimos de ${deQuien} por tu cuenta corriente.`
      : "Te escribimos por tu cuenta corriente.",
  );
  lineas.push("");

  if (montoRecargo > 0) {
    lineas.push(`Saldo: ${moneda.format(saldo)}`);
    lineas.push(`Recargo por mora: ${moneda.format(montoRecargo)}`);
    lineas.push(`*Total a pagar: ${moneda.format(saldoConRecargo)}*`);
  } else {
    lineas.push(`*Total a pagar: ${moneda.format(saldo)}*`);
  }

  if (diasVencido !== null && diasVencido > 0) {
    lineas.push(`Venció hace ${diasVencido} día${diasVencido === 1 ? "" : "s"}.`);
  } else if (fechaVencimiento) {
    lineas.push(`Vence el ${fechaCorta(fechaVencimiento)}.`);
  }

  if (urlResumen) {
    lineas.push("");
    lineas.push(`Ver el detalle: ${urlResumen}`);
  }

  lineas.push("");
  lineas.push("Cualquier duda avisame y lo revisamos. ¡Gracias!");

  return lineas.join("\n");
}
