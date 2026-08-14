import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { slugDesdeHost, HEADER_NEGOCIO_SLUG } from "@/shared/lib/negocio-slug";

export interface Tenant {
  negocio_id: string;
  negocio: {
    id: string;
    nombre: string;
    slug: string;
    logo_url: string | null;
  };
}

/**
 * Cliente anónimo sin cookies ni sesión, solo para traducir slug -> negocio.
 * No usa createPublicClient porque esto corre ANTES de saber qué tenant es:
 * es la consulta que lo decide.
 */
const clienteResolucion = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );

const buscarPorSlug = cache(async (slug: string) => {
  const { data, error } = await clienteResolucion()
    .from("negocios")
    .select("id, nombre, slug, logo_url")
    .eq("slug", slug)
    .eq("estado", "activo")
    .maybeSingle();

  if (error) {
    console.error("[RESOLVE TENANT ERROR]", error);
    return null;
  }
  return data;
});

/**
 * ÚNICA forma de obtener el negocio de un catálogo público.
 *
 * El slug sale del subdominio (evens.comerz.app) o del path (/store/evens); si
 * llegan los dos, manda el subdominio. No hay tenant por defecto: sin slug, o
 * con un slug que no existe o está suspendido, la respuesta es 404. Nunca
 * devuelve "el único negocio".
 *
 * Devuelve además el negocio_id para las consultas, aunque la RLS lo resuelve
 * por su cuenta desde el header x-negocio-slug.
 */
export async function resolveTenant({
  hostname,
  slug,
}: {
  hostname?: string | null;
  slug?: string | null;
}): Promise<Tenant> {
  const slugFinal = slugDesdeHost(hostname) ?? (slug?.trim() || null);

  if (!slugFinal) notFound();

  const negocio = await buscarPorSlug(slugFinal);
  if (negocio) return { negocio_id: negocio.id, negocio };

  // El slug no resuelve: antes de dar 404, ver si es uno VIEJO de un negocio
  // que cambió de link. Los catálogos se comparten por WhatsApp y quedan meses
  // en chats y estados, así que un link viejo es tráfico real — mandarlo a un
  // 404 es perder la venta sin que nadie se entere.
  //
  // La consulta va acá y no en el middleware a propósito: en el middleware
  // costaría una ida a la base en CADA request del sitio, y esto solo hace
  // falta en el caso raro. Es el camino del 404, no el normal.
  const vigente = await buscarSlugHistorico(slugFinal);
  if (vigente) redirect(`/store/${vigente}`);

  notFound();
}

/** A qué slug vigente corresponde uno viejo, o null si nunca existió. */
const buscarSlugHistorico = cache(async (slug: string) => {
  const { data } = await clienteResolucion()
    .from("slugs_historicos")
    .select("negocios(slug, estado)")
    .eq("slug", slug)
    .maybeSingle();

  const negocio = Array.isArray(data?.negocios) ? data?.negocios[0] : data?.negocios;
  // Un negocio dado de baja no redirige a ningún lado: sigue siendo 404.
  if (!negocio || negocio.estado !== "activo") return null;
  return negocio.slug as string;
});

/** Igual que resolveTenant pero sin 404: para decidir rutas, no para render. */
export async function tenantOpcional({
  hostname,
  slug,
}: {
  hostname?: string | null;
  slug?: string | null;
}): Promise<Tenant | null> {
  const slugFinal = slugDesdeHost(hostname) ?? (slug?.trim() || null);
  if (!slugFinal) return null;

  const negocio = await buscarPorSlug(slugFinal);
  return negocio ? { negocio_id: negocio.id, negocio } : null;
}

export { HEADER_NEGOCIO_SLUG };
