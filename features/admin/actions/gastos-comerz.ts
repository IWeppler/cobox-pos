"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";

import {
  CATEGORIAS_GASTO,
  type CategoriaGasto,
  type TipoGasto,
} from "@/features/admin/lib/categorias-gasto";

export interface GastoComerz {
  id: string;
  mes: string;
  hasta: string | null;
  tipo: TipoGasto;
  categoria: CategoriaGasto;
  concepto: string;
  monto: number;
  nota: string | null;
}

/** Primer día del mes de una fecha, en UTC y como "YYYY-MM-01". */
function primerDiaDelMes(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * TODOS los gastos anotados.
 *
 * No filtra por mes a propósito: un gasto FIJO no tiene una fila por mes sino
 * UNA que aplica a un rango, así que "los de marzo" es una cuenta y no una
 * consulta. Esa cuenta vive en `gastos-por-mes.ts`, con tests, y la usan tanto
 * el gráfico (doce meses) como el resumen del mes en curso.
 *
 * Son las filas de un solo negocio —el propio— así que traerlas todas no es
 * un problema de volumen: son decenas, no miles.
 */
export async function getGastosAction(): Promise<GastoComerz[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("gastos_comerz")
    .select("id, mes, hasta, tipo, categoria, concepto, monto, nota")
    .order("mes", { ascending: false })
    .order("concepto");

  if (error) {
    console.error("[GASTOS COMERZ] No se pudieron leer:", error);
    return [];
  }

  return (data ?? []).map((g) => ({
    id: g.id as string,
    mes: g.mes as string,
    hasta: (g.hasta as string | null) ?? null,
    tipo: g.tipo as TipoGasto,
    categoria: g.categoria as CategoriaGasto,
    concepto: g.concepto as string,
    monto: Number(g.monto ?? 0),
    nota: (g.nota as string | null) ?? null,
  }));
}

export interface EstadoGasto {
  error: string | null;
  success: boolean;
}

const CATEGORIAS_VALIDAS = new Set<string>(
  CATEGORIAS_GASTO.map((c) => c.valor),
);

/**
 * Anota un gasto.
 *
 * INSERT y no upsert, al revés que la versión vieja: antes había una fila por
 * proveedor y por mes, y volver a cargar Vercel corregía la anterior. Ahora un
 * mes puede tener varios gastos de la misma categoría —tres campañas de
 * marketing distintas son tres gastos, no una corrección— así que cada uno es
 * su propia fila.
 *
 * (La versión vieja además declaraba `onConflict: "mes,proveedor"` sobre un
 * índice único que no existía: habría fallado en el primer uso real.)
 */
export async function registrarGastoAction(
  _prev: EstadoGasto | null,
  formData: FormData,
): Promise<EstadoGasto> {
  const concepto = ((formData.get("concepto") as string) ?? "").trim();
  const monto = Number(formData.get("monto"));
  const tipo = (formData.get("tipo") as string) || "UNICO";
  const categoria = (formData.get("categoria") as string) || "otro";
  const nota = ((formData.get("nota") as string) ?? "").trim() || null;
  const mes = (formData.get("mes") as string) || primerDiaDelMes(new Date());

  if (!concepto) return { error: "Poné un concepto.", success: false };
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "El monto no es válido.", success: false };
  }
  // Se validan acá aunque el form ya los limite: un select es una sugerencia
  // del navegador, no un control. La base tiene además su CHECK.
  if (tipo !== "FIJO" && tipo !== "UNICO") {
    return { error: "Tipo de gasto inválido.", success: false };
  }
  if (!CATEGORIAS_VALIDAS.has(categoria)) {
    return { error: "Categoría inválida.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: esSuper } = await supabase.rpc("is_super_admin");
  if (!esSuper) return { error: "No autorizado.", success: false };

  const { error } = await supabase.from("gastos_comerz").insert({
    mes,
    tipo,
    categoria,
    concepto,
    monto,
    nota,
    registrado_por: user?.id ?? null,
  });

  if (error) {
    console.error("[GASTOS COMERZ]", error);
    return { error: "No se pudo guardar el gasto.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}

/**
 * Corrige un gasto ya anotado.
 *
 * Acepta `hasta` porque es la forma correcta de terminar un gasto FIJO: se le
 * pone el último mes en que aplicó y listo. Borrarlo también se puede (ver
 * abajo), pero son cosas distintas — dar de baja conserva la historia, borrar
 * la reescribe.
 */
export async function actualizarGastoAction(
  _prev: EstadoGasto | null,
  formData: FormData,
): Promise<EstadoGasto> {
  const id = (formData.get("id") as string) || "";
  const concepto = ((formData.get("concepto") as string) ?? "").trim();
  const monto = Number(formData.get("monto"));
  const tipo = (formData.get("tipo") as string) || "UNICO";
  const categoria = (formData.get("categoria") as string) || "otro";
  const nota = ((formData.get("nota") as string) ?? "").trim() || null;
  const hastaCrudo = ((formData.get("hasta") as string) ?? "").trim();

  if (!id) return { error: "Falta el gasto a editar.", success: false };
  if (!concepto) return { error: "Poné un concepto.", success: false };
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "El monto no es válido.", success: false };
  }
  if (tipo !== "FIJO" && tipo !== "UNICO") {
    return { error: "Tipo de gasto inválido.", success: false };
  }
  if (!CATEGORIAS_VALIDAS.has(categoria)) {
    return { error: "Categoría inválida.", success: false };
  }

  // La base tiene un CHECK que impide `hasta` en un ÚNICO. Se limpia acá para
  // no depender de que el form haya escondido el campo: si el tipo cambió a
  // ÚNICO en la misma edición, el `hasta` viejo tiene que irse con él.
  const hasta = tipo === "FIJO" && hastaCrudo ? hastaCrudo : null;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: esSuper } = await supabase.rpc("is_super_admin");
  if (!esSuper) return { error: "No autorizado.", success: false };

  const { error } = await supabase
    .from("gastos_comerz")
    .update({ concepto, monto, tipo, categoria, nota, hasta })
    .eq("id", id);

  if (error) {
    console.error("[GASTOS COMERZ] update", error);
    return { error: "No se pudo guardar el cambio.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}

/**
 * Borra un gasto.
 *
 * Existe para corregir un error de carga —un monto mal tipeado, un gasto
 * duplicado—, no para terminar un gasto fijo. Para eso está `hasta`: borrar un
 * FIJO cambia el margen de TODOS los meses en que estuvo vigente, y un mes ya
 * cerrado no debería cambiar de resultado el año que viene.
 */
export async function eliminarGastoAction(id: string): Promise<EstadoGasto> {
  if (!id) return { error: "Falta el gasto a borrar.", success: false };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: esSuper } = await supabase.rpc("is_super_admin");
  if (!esSuper) return { error: "No autorizado.", success: false };

  const { error } = await supabase.from("gastos_comerz").delete().eq("id", id);

  if (error) {
    console.error("[GASTOS COMERZ] delete", error);
    return { error: "No se pudo borrar el gasto.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}
