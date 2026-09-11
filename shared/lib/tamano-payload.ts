import { reportarErrorCliente } from "./reportar-error-cliente";

/**
 * Cuánto pesa lo que se le manda a una Server Action, y aviso cuando es
 * demasiado.
 *
 * POR QUÉ EXISTE. El 10 y el 11/9/2026 una vendedora de Estilo Bonito editó
 * precio + foto de un producto y las dos veces le salió "Esta pantalla falló —
 * el servidor devolvió una respuesta incompleta". No quedaba rastro en la base
 * (las fotos sí habían subido bien, minutos antes) y en el log solo estaba el
 * boundary diciendo que la respuesta no era RSC. O sea: el síntoma se veía y
 * el tamaño del POST, que era la causa, no se medía en ningún lado.
 *
 * EL TOPE QUE MANDA NO ES EL DE NEXT. `next.config.ts` declara
 * `serverActions.bodySizeLimit: "10mb"`, pero eso solo sube el límite DE NEXT:
 * la plataforma corta antes, y el request nunca llega al handler. Lo que
 * devuelve no es un payload RSC, así que el cliente no lo puede leer como
 * error de la action — termina en el boundary con un mensaje genérico. Subir
 * `bodySizeLimit` no arregla nada; lo único que arregla es mandar menos.
 *
 * Por eso esto MIDE y AVISA, no bloquea: un guardado de producto que se
 * rechaza del lado del cliente por pasarse de un umbral estimado sería peor
 * que el bug —la vendedora se queda sin poder guardar igual— y el tamaño real
 * del cuerpo multipart es algo más que la suma de las partes. Lo que hace
 * falta es que el caso deje registro ANTES de romperse, con los campos
 * culpables adentro.
 */

const MB = 1024 * 1024;

/**
 * Lo que acepta la plataforma por request. No es configurable desde el repo.
 * Está acá como número declarado —y no escondido en un comentario— para que el
 * umbral de aviso se lea en relación a algo.
 */
export const TOPE_BODY_PLATAFORMA = 4.5 * MB;

/**
 * Desde dónde se avisa. 3 MB y no 4,5: el margen es para el overhead del
 * multipart y, sobre todo, para enterarse ANTES de que empiece a fallar. Un
 * aviso que solo salta cuando ya se rompió no sirve para prevenir nada.
 */
export const UMBRAL_AVISO_PAYLOAD = 3 * MB;

export type MedicionPayload = {
  bytes: number;
  /** Bytes por campo, de mayor a menor. Es lo que dice QUÉ hay que sacar. */
  porCampo: { campo: string; bytes: number }[];
};

/**
 * Suma aproximada del cuerpo: los `File` por su tamaño y el resto por el largo
 * en UTF-8 de su valor. No cuenta los delimitadores del multipart, así que es
 * un piso, no el número exacto — para decidir si un POST es chico o pesado
 * alcanza y sobra.
 */
export function medirFormData(formData: FormData): MedicionPayload {
  const acumulado = new Map<string, number>();

  for (const [campo, valor] of formData.entries()) {
    const bytes =
      typeof valor === "string"
        ? new Blob([valor]).size
        : ((valor as File)?.size ?? 0);

    acumulado.set(campo, (acumulado.get(campo) ?? 0) + bytes);
  }

  const porCampo = [...acumulado.entries()]
    .map(([campo, bytes]) => ({ campo, bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    bytes: porCampo.reduce((total, c) => total + c.bytes, 0),
    porCampo,
  };
}

/**
 * Mide el payload y, si se pasa del umbral, lo reporta al log de cliente.
 * Devuelve la medición por si el llamador quiere hacer algo más con ella.
 *
 * No lanza ni bloquea: ver el comentario de arriba.
 */
export function controlarPayloadDeAction(
  operacion: string,
  formData: FormData,
): MedicionPayload {
  const medicion = medirFormData(formData);

  if (medicion.bytes >= UMBRAL_AVISO_PAYLOAD) {
    reportarErrorCliente({
      tipo: "payload-grande",
      mensaje: `[${operacion}] payload de ${(medicion.bytes / MB).toFixed(2)}MB (umbral ${(UMBRAL_AVISO_PAYLOAD / MB).toFixed(1)}MB, tope de plataforma ${(TOPE_BODY_PLATAFORMA / MB).toFixed(1)}MB)`,
      detalle: {
        operacion,
        bytes: medicion.bytes,
        // Solo los cinco más grandes: el resto son campos de texto de un
        // formulario y llenarían el log sin decir nada.
        porCampo: medicion.porCampo.slice(0, 5),
        superaTope: medicion.bytes >= TOPE_BODY_PLATAFORMA,
      },
    });
  }

  return medicion;
}
