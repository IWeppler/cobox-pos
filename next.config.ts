import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

// El service worker queda acotado a CACHEAR ASSETS ESTÁTICOS INMUTABLES y
// nada más. La config default de next-pwa hacía tres cosas que en esta app son
// peligrosas — ver los comentarios de cada opción. next-pwa 5.6.0 está sin
// mantenimiento desde 2022 y sus defaults fueron pensados para el Pages Router
// de Next 12: no entienden ni RSC ni Server Actions.
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",

  // Default: true. Hacía `location.reload()` en el evento `online`. En el
  // celular ese evento se dispara con cualquier parpadeo de señal (cambio de
  // antena, handoff wifi/4G, entrar a un probador): la página se recargaba
  // sola y se perdía el formulario de carga a medio llenar. Es la explicación
  // más simple de "cada tanto se rompe mientras cargo un producto".
  reloadOnOnline: false,

  // Default: true. Un service worker nuevo tomaba el control a mitad de
  // sesión, con la página ya cargada apuntando a los chunks del build
  // anterior. Con false, el SW nuevo espera a que se cierren las pestañas.
  skipWaiting: false,

  // Default: true las dos. Cacheaban el HTML de "/" con NetworkFirst; después
  // de un deploy podía servir un documento viejo que referencia chunks de otro
  // build. Van juntas: `dynamicStartUrl` inyecta la regla `start-url` por su
  // cuenta, sin mirar `cacheStartUrl`, así que apagar solo una no alcanza.
  cacheStartUrl: false,
  dynamicStartUrl: false,

  // Solo assets estáticos e inmutables. NO hay regla que matchee navegaciones,
  // peticiones RSC ni llamadas a Supabase: esas van derecho a la red, sin que
  // el SW las toque. Los defaults de next-pwa tenían tres reglas catch-all
  // (`others`, `apis`, `cross-origin`) con NetworkFirst y
  // networkTimeoutSeconds: 10, y de ahí salían dos problemas:
  //
  // 1. `others` agarraba las navegaciones. Con red mala, a los 10 segundos
  //    Workbox caía al caché; si esa ruta no estaba cacheada (maxEntries era
  //    32), el handler rechazaba, y una navegación rechazada la resuelve el
  //    navegador con SU pantalla de error — que en una PWA instalada en
  //    Android es literalmente "This page couldn't load. Reload to try again,
  //    or go back.". Sin log en Vercel porque el request nunca llegó.
  //
  // 2. `cross-origin` cacheaba los GET a Supabase por 1 HORA. En un POS eso
  //    significa que con red lenta una consulta de stock o de precios podía
  //    responder con datos de hasta una hora atrás. Es exactamente el tipo de
  //    cosa que no puede pasar acá.
  runtimeCaching: [
    {
      // Chunks de Next: llevan hash en el nombre, son inmutables. CacheFirst
      // con vencimiento largo, y entradas de sobra para que un deploy no
      // desaloje los del build anterior mientras alguien tiene la app abierta
      // (el default era maxEntries: 32, que se llenaba enseguida).
      urlPattern: /\/_next\/static\/.+/i,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      // Imágenes de producto en Supabase Storage: nombre con UUID, se suben
      // con cacheControl de un año. Nunca cambian bajo la misma URL.
      urlPattern:
        /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "supabase-storage",
        expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Assets propios de /public (logos, splash, iconos).
      urlPattern: /\.(?:png|jpg|jpeg|svg|webp|ico)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-image-assets",
        expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-webfonts",
        expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "google-fonts-stylesheets",
        expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  // El default de Next para Server Actions es 1MB. El alta/edición de
  // productos manda main + thumbnail + grid por imagen (~0.33MB cada juego
  // en el mejor caso), así que con 3 imágenes ya se rozaba el límite y la
  // acción moría sin dejar log en Vercel. El tope real de lo que puede
  // llegar acá lo pone el cliente: MAX_IMAGENES_PRODUCTO archivos, cada uno
  // comprimido antes de subir (ver shared/utils/image-optimizer.ts).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withPWA(nextConfig);
