export class TimeoutError extends Error {
  constructor(message = "La operación tardó demasiado y se canceló.") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Server actions de Next no exponen un AbortSignal para cortar el fetch
 * interno, así que esto es un timeout "de UI": si la promesa no resuelve a
 * tiempo, se la trata como error igual (el botón se destraba), aunque la
 * request original pueda seguir viva en el server hasta que responda.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
