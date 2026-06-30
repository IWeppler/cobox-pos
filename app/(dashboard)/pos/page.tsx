import { getProductosAction } from "@/shared/actions/store-actions";
import { PosTerminal } from "@/features/pos/ui/pos-terminal";
import { PosCart } from "@/shared/components/pos-cart";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificamos permisos
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Traemos los datos para la terminal
  const [productosRes, categoriasRes] = await Promise.all([
    getProductosAction(),
    supabase
      .from("categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true }),
  ]);

  const productos = productosRes.data || [];
  const categoriasDB = categoriasRes.data || [];

  return (
    <div className="flex h-full min-h-0">
      <PosTerminal productos={productos} categorias={categoriasDB} />
      <PosCart />
    </div>
  );
}
