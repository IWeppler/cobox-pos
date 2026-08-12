/**
 * Stub de `server-only` para vitest.
 *
 * `server-only` no es una librería: es un paquete que explota a propósito si
 * Next lo resuelve desde el bundle del cliente, y así impide que un módulo de
 * servidor viaje al navegador. Fuera de Next no hay nada que resolver, así que
 * un test que importe un archivo con `import "server-only"` fallaba al
 * importar.
 *
 * Aliaseado en vitest.config.ts. Solo lo usan los tests: el build de Next sigue
 * resolviendo el paquete real, que es donde el guard tiene sentido.
 */
export {};
