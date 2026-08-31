/**
 * Hace cuánto se trajo un dato, dicho como lo diría una persona.
 *
 * Es la mitad honesta del cache offline: guardar el catálogo en el celular
 * sirve, pero mostrarlo sin decir de cuándo es convierte una ayuda en una
 * trampa. "Precios de hace 12 minutos" se puede evaluar en el mostrador;
 * un precio sin fecha, no.
 *
 * Redondea hacia abajo y en unidades gruesas a propósito: la precisión al
 * segundo invita a confiar en el número, y lo único que importa acá es el
 * orden de magnitud.
 */
export function antiguedadEnPalabras(
  actualizadoEn: number,
  ahora: number = Date.now(),
): string {
  const segundos = Math.max(0, Math.floor((ahora - actualizadoEn) / 1000));

  if (segundos < 60) return "recién";

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** Desde cuándo un dato de catálogo merece que se avise que es viejo, con
 * conexión. Por debajo de esto el aviso sería ruido: el catálogo se repide
 * solo cada 3 minutos. Sin conexión el aviso aparece siempre, sin importar
 * la antigüedad — ahí lo que importa no es cuán viejo es, sino que NO se está
 * actualizando. */
export const ANTIGUEDAD_PARA_AVISAR_MS = 10 * 60 * 1000;

export function hayQueAvisar(
  actualizadoEn: number | undefined,
  hayConexion: boolean,
  ahora: number = Date.now(),
): boolean {
  if (!actualizadoEn) return false;
  if (!hayConexion) return true;
  return ahora - actualizadoEn >= ANTIGUEDAD_PARA_AVISAR_MS;
}
