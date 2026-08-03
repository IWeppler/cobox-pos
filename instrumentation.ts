/**
 * Zona horaria del server.
 *
 * Todo el cálculo de fechas del panel, reportes y caja usa `new Date()` con
 * los getters locales (getDate, getDay, getHours): asume la hora del comercio,
 * que es Argentina. En local eso funciona solo porque la máquina ya está en AR;
 * en Vercel el runtime arranca en UTC y el panel se rompía en la franja
 * 21:00-24:00 AR, cuando allá ya es el día siguiente: el 2/8 a las 23:00 el
 * panel calculaba "esta semana" desde el lunes 3/8 00:00 UTC y mostraba todo
 * en cero (ingresos, unidades, ticket, ganancia, insights, rankings).
 *
 * Se fija acá y no en las variables de entorno de Vercel para que la corrección
 * viaje con el código: no depende de que alguien se acuerde de configurarla al
 * crear un deploy o un preview. Si algún día hay un comercio fuera de AR, la
 * zona pasa a ser un dato del negocio y el cálculo tiene que hacerse por
 * negocio, no por proceso.
 */
export function register() {
  // Se pisa siempre: en Lambda (Vercel) `TZ` ya viene seteada en UTC por la
  // plataforma, así que un `if (!process.env.TZ)` no corregiría nada. El
  // escape hatch es explícito y nuestro.
  process.env.TZ = process.env.ZONA_HORARIA_NEGOCIO?.trim() ||
    "America/Argentina/Buenos_Aires";
}
