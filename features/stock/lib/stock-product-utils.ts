export function capitalizar(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).replace("_", " ");
}

export function parseProductImages(imagenUrl: unknown): string[] {
  if (Array.isArray(imagenUrl)) return imagenUrl;
  if (typeof imagenUrl !== "string" || !imagenUrl) return [];

  try {
    const parsed = JSON.parse(imagenUrl);
    return Array.isArray(parsed) ? parsed : [imagenUrl];
  } catch {
    return [imagenUrl];
  }
}

export function obtenerPrimeraImagen(imagenUrl: unknown): string | null {
  if (!imagenUrl) return null;
  if (Array.isArray(imagenUrl) && imagenUrl.length > 0) return imagenUrl[0];

  if (typeof imagenUrl === "string") {
    if (imagenUrl.startsWith("[")) {
      try {
        const parsed = JSON.parse(imagenUrl);
        return Array.isArray(parsed) ? parsed[0] : imagenUrl;
      } catch {
        return imagenUrl;
      }
    }
    return imagenUrl;
  }

  return null;
}

export function getTotalStock(producto: any) {
  const listaVariantes =
    producto.producto_variantes || producto.stock || [];

  return listaVariantes.reduce((acc: number, curr: any) => {
    // Busca 'stock' (nuevo modelo) o 'cantidad' (viejo modelo)
    const cantidadStr = curr.stock !== undefined ? curr.stock : curr.cantidad;
    const cantidad = Number(cantidadStr) || 0;
    return acc + cantidad;
  }, 0);
}

export function ordenarStockVariantes(variantes: any[] = []) {
  return [...variantes].sort((a, b) => {
    // Busca 'nombre_display' (nuevo modelo) o 'variante' (viejo modelo)
    const nameA = String(a.nombre_display || a.variante || "").toUpperCase();
    const nameB = String(b.nombre_display || b.variante || "").toUpperCase();

    // Ordenamiento alfabético estándar
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
}

export function getVariantesVisibles(producto: any, isAdmin: boolean) {
  const listaVariantes =
    producto.producto_variantes || producto.stock || [];
  const stockOrdenado = ordenarStockVariantes(listaVariantes);
  
  return isAdmin
    ? stockOrdenado
    : stockOrdenado.filter((v) => {
        const qty = v.stock !== undefined ? v.stock : v.cantidad;
        return Number(qty) > 0;
      });
}

export function puedeVenderStock(stockMax: number, isAdmin: boolean) {
  return stockMax > 0 || isAdmin;
}