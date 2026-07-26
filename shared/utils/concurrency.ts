/**
 * Corre `tasks` con como máximo `limit` en vuelo a la vez — evita saturar
 * red/Storage cuando hay que crear decenas de productos de un golpe (ej.
 * "Crear todos los sugeridos" en la conciliación de remitos). Cada tarea se
 * ejecuta igual aunque otra haya fallado; el resultado conserva el orden de
 * entrada.
 */
export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const resultados: T[] = new Array(tasks.length);
  let siguiente = 0;

  async function worker() {
    while (siguiente < tasks.length) {
      const indice = siguiente++;
      resultados[indice] = await tasks[indice]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);

  return resultados;
}
