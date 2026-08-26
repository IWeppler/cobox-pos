/**
 * Cuánto margen tiene una cuenta para verificar su correo.
 *
 * La verificación dejó de ser una puerta y pasó a ser una deuda: el alta entra
 * derecho al sistema y el mail se manda igual, pero no frena nada. El motivo
 * es medible — el paso de "andá a tu casilla y volvé" es donde se caen las
 * altas, porque obliga a cambiar de app en el único momento en que la persona
 * todavía no vio nada del producto.
 *
 * Lo que reemplaza a la puerta es este plazo: se avisa desde el primer día y a
 * los 7 se vuelve urgente. El plazo existe porque un mail sin verificar no es
 * gratis — es la única forma de recuperar la contraseña, y también lo que
 * evita que alguien se registre con el mail de otro.
 *
 * Módulo puro: recibe las fechas resueltas y se testea sin reloj ni sesión.
 */

export const DIAS_PARA_VERIFICAR = 7;

export type EstadoVerificacion =
  /** Ya verificó: no se muestra nada. */
  | { estado: "verificado" }
  /** Todavía tiene plazo. Aviso suave, con los días que le quedan. */
  | { estado: "pendiente"; diasRestantes: number }
  /** Se le pasaron los 7 días. El aviso pasa a ser urgente. */
  | { estado: "vencido"; diasVencido: number };

const DIA_MS = 86_400_000;

export function estadoVerificacionEmail({
  emailConfirmado,
  creadoEn,
  ahora = new Date(),
}: {
  emailConfirmado: boolean;
  /** Alta de la cuenta (`auth.users.created_at`). */
  creadoEn: string | Date | null | undefined;
  ahora?: Date;
}): EstadoVerificacion {
  if (emailConfirmado) return { estado: "verificado" };

  // Sin fecha de alta no se puede contar el plazo. Se trata como recién
  // creada —aviso suave con el plazo completo— y no como vencida: apurar a
  // alguien por un dato que falta de nuestro lado es peor que avisar de más.
  if (!creadoEn) {
    return { estado: "pendiente", diasRestantes: DIAS_PARA_VERIFICAR };
  }

  const alta = new Date(creadoEn).getTime();
  if (Number.isNaN(alta)) {
    return { estado: "pendiente", diasRestantes: DIAS_PARA_VERIFICAR };
  }

  const diasTranscurridos = Math.floor((ahora.getTime() - alta) / DIA_MS);
  const restantes = DIAS_PARA_VERIFICAR - diasTranscurridos;

  if (restantes > 0) return { estado: "pendiente", diasRestantes: restantes };

  return { estado: "vencido", diasVencido: Math.abs(restantes) };
}

/**
 * Segundos que hay que esperar entre dos envíos del mail de verificación.
 *
 * No es una regla nuestra: el SMTP por defecto de Supabase tiene un límite de
 * mensajes por hora bajísimo, y gastarlo con dos clicks seguidos deja a la
 * persona sin poder verificar durante una hora — exactamente lo contrario de
 * lo que busca el botón. El botón se apaga solo durante este rato.
 */
export const SEGUNDOS_ENTRE_ENVIOS = 60;
