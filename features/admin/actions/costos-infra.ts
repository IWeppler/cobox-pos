"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";

export interface CostoInfraFila {
  id: string;
  mes: string;
  proveedor: string;
  monto: number;
  nota: string | null;
}

/** Primer día del mes de una fecha, en UTC y como "YYYY-MM-01". */
function primerDiaDelMes(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Los costos del mes en curso. Es el único período que se compara contra lo
 * cobrado en el panel: mezclar meses daría un margen que no es de nadie. */
export async function getCostosDelMesAction(): Promise<CostoInfraFila[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("costos_infra")
    .select("id, mes, proveedor, monto, nota")
    .eq("mes", primerDiaDelMes(new Date()))
    .order("proveedor");

  return (data ?? []).map((c) => ({
    id: c.id as string,
    mes: c.mes as string,
    proveedor: c.proveedor as string,
    monto: Number(c.monto ?? 0),
    nota: (c.nota as string | null) ?? null,
  }));
}

export interface EstadoCosto {
  error: string | null;
  success: boolean;
}

/**
 * Carga o corrige el costo de un proveedor para un mes.
 *
 * Es un upsert sobre `(mes, proveedor)` y no un insert: la factura de Vercel
 * se mira varias veces antes de cerrar el mes, y cada mirada no puede sumar
 * una fila nueva. Corregir tiene que ser corregir, no acumular.
 */
export async function guardarCostoInfraAction(
  _prev: EstadoCosto | null,
  formData: FormData,
): Promise<EstadoCosto> {
  const proveedor = (formData.get("proveedor") as string) || "";
  const monto = Number(formData.get("monto"));
  const mes = (formData.get("mes") as string) || primerDiaDelMes(new Date());
  const nota = ((formData.get("nota") as string) ?? "").trim() || null;

  if (!proveedor) return { error: "Elegí el proveedor.", success: false };
  if (!Number.isFinite(monto) || monto < 0) {
    return { error: "El monto no es válido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: esSuper } = await supabase.rpc("is_super_admin");
  if (!esSuper) return { error: "No autorizado.", success: false };

  const { error } = await supabase
    .from("costos_infra")
    .upsert(
      { mes, proveedor, monto, nota, registrado_por: user?.id ?? null },
      { onConflict: "mes,proveedor" },
    );

  if (error) {
    console.error("[COSTOS INFRA]", error);
    return { error: "No se pudo guardar el costo.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}
