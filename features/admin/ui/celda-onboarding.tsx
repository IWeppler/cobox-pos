import { Check, MessageCircle } from "lucide-react";
import {
  ETIQUETA_ACCESO,
  type EstadoAcceso,
} from "@/features/admin/lib/estado-acceso";
import { linkWhatsapp } from "@/shared/lib/telefono-whatsapp";

/** Cada estado con el color que le corresponde por lo que hay que HACER: rojo
 * lo que está trabado, ámbar lo que hay que empujar, verde lo que ya anda. */
const COLOR_ACCESO: Record<EstadoAcceso, string> = {
  SIN_CONFIRMAR: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  NO_ENTRO: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  SOLO_EL_LINK: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  ENTRO: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

/**
 * Hace cuánto, en la unidad más grande que dé un número entendible.
 *
 * "hace 3 días" se lee de un vistazo en una tabla de 7 filas; una fecha
 * completa obliga a hacer la resta mentalmente en cada renglón.
 */
function hace(iso: string | null): string | null {
  if (!iso) return null;

  const minutos = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (minutos < 60) return "recién";
  if (minutos < 60 * 24) return `hace ${Math.floor(minutos / 60)} h`;

  const dias = Math.floor(minutos / (60 * 24));
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

export function CeldaAcceso({
  acceso,
  ultimaActividad,
}: Readonly<{ acceso: EstadoAcceso; ultimaActividad: string | null }>) {
  const desde = hace(ultimaActividad);

  return (
    <div>
      <span
        className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${COLOR_ACCESO[acceso]}`}
      >
        {ETIQUETA_ACCESO[acceso]}
      </span>
      {/* La fecha solo cuando hubo algo: en "sin confirmar" no hay actividad
          que mostrar y un "—" suelto invita a buscarle sentido. */}
      {desde && acceso !== "SIN_CONFIRMAR" && (
        <p className="mt-0.5 text-[11px] text-white/30">{desde}</p>
      )}
    </div>
  );
}

export function CeldaOnboarding({
  onboarding,
}: Readonly<{
  onboarding: { completados: number; total: number; activado: boolean } | null;
}>) {
  if (!onboarding) return <span className="text-xs text-white/30">—</span>;

  const { completados, total, activado } = onboarding;

  return (
    <div className="flex items-center gap-1.5">
      {activado && <Check className="size-3.5 shrink-0 text-emerald-400" />}
      <span
        className={`text-xs ${activado ? "text-emerald-400" : "text-white/60"}`}
      >
        {completados}/{total}
      </span>
    </div>
  );
}

/**
 * El botón para escribirle al comercio.
 *
 * El número es el del LOCAL (`configuracion_pos.whatsapp`), que es el único
 * que existe: no hay teléfono personal del dueño en ninguna tabla. Sin número
 * cargado el botón no se muestra en vez de abrir un wa.me vacío, que lleva a
 * WhatsApp sin destinatario y parece que la app se rompió.
 */
export function BotonWhatsapp({
  whatsapp,
  nombre,
}: Readonly<{ whatsapp: string | null; nombre: string }>) {
  if (!whatsapp?.trim()) return null;

  // El saludo va prellenado pero corto: lo que sigue depende de por qué se le
  // escribe, y un texto largo se borra igual.
  const href = linkWhatsapp(whatsapp, `Hola ${nombre}! Te escribo de Comerz.`);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Escribirle a ${nombre} por WhatsApp`}
      className="inline-flex size-7 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20"
    >
      <MessageCircle className="size-3.5" />
    </a>
  );
}
