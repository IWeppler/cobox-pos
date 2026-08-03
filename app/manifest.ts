import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Comerz POS",
    short_name: "Comerz POS",
    description: "Sistema de gestión y punto de venta web",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "portrait-primary",
    // Los dos archivos eran copias de logo.png a 500x500, o sea que ninguno
    // medía lo que declaraba acá. Ahora sí. Van como "any" y no "maskable":
    // el logo no tiene la zona de respeto que exige maskable, y declararlo
    // igual hacía que Android lo recortara al enmascararlo.
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
