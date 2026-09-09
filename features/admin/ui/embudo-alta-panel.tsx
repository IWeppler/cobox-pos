import { AlertTriangle, ChevronRight } from "lucide-react";
import { FunnelChart } from "@/components/charts/funnel-chart";
import type {
  ResumenEmbudoAlta,
  UsuarioEnEmbudo,
} from "@/features/admin/lib/embudo-alta";
import { ETIQUETA_ETAPA } from "@/features/admin/lib/embudo-alta";
import { MarcarPruebaBoton } from "./marcar-prueba-boton";

/**
 * El embudo de ANTES del negocio: registro → confirmación → sesión → negocio.
 *
 * Server Component, igual que `FunnelPanel`. `FunnelChart` es cliente (usa
 * motion) y recibe solo datos serializables — por eso no se le pasa
 * `onHoverChange`, que sería una función cruzando el límite.
 *
 * La lista de abajo va en un `<details>` y no en un panel siempre abierto: son
 * hasta una decena de mails, y el gráfico es lo que se mira todos los días. Un
 * `<details>` nativo evita convertir todo esto en un client component solo para
 * abrir y cerrar.
 */
export function EmbudoAltaPanel({
  resumen,
  perdidos,
}: Readonly<{ resumen: ResumenEmbudoAlta; perdidos: UsuarioEnEmbudo[] }>) {
  // El gráfico necesita `value`; el porcentaje lo calcula solo contra el
  // primer escalón, que es justo lo que significa acá (todos arrancan en
  // "creó la cuenta").
  const data = resumen.escalones.map((e) => ({
    label: e.etiqueta,
    value: e.llegaron,
    displayValue: String(e.llegaron),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white/90">
          Cuenta → negocio creado
        </h2>
        <p className="text-xs text-white/40">
          El tramo que el funnel de abajo no ve: arranca en{" "}
          <code className="text-white/60">auth.users</code> y termina donde el
          otro empieza.
          {resumen.excluidos > 0 &&
            ` ${resumen.excluidos} quedan afuera de la cuenta` +
              (resumen.pruebas > 0
                ? `, ${resumen.pruebas} de ellos por ser pruebas propias.`
                : " (super admin, invitados o miembros de otro negocio).")}
        </p>
      </div>

      {resumen.total === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-white/40">
          Todavía no hay altas para medir.
        </p>
      ) : (
        <>
          <FunnelChart
            data={data}
            orientation="horizontal"
            color="var(--chart-1)"
            layers={3}
            className="h-56 w-full"
          />

          {resumen.peorEscalon && (
            <p className="text-xs text-white/60">
              Donde más se pierde:{" "}
              <span className="font-semibold text-amber-400/90">
                {resumen.peorEscalon.etiqueta}
              </span>{" "}
              — {resumen.peorEscalon.seCayeron}{" "}
              {resumen.peorEscalon.seCayeron === 1
                ? "se quedó ahí"
                : "se quedaron ahí"}
              .
            </p>
          )}

          {resumen.medianaMinutosConfirmar !== null && (
            <p className="text-[11px] text-white/40">
              Mediana hasta confirmar el mail:{" "}
              <span className="text-white/70">
                {formatearEspera(resumen.medianaMinutosConfirmar)}
              </span>
              . Es el dato que dice si el problema es la entrega del mail o lo
              que pasa después.
            </p>
          )}

          {/* "Sesión creada" sale de `last_sign_in_at`, que Supabase escribe
              al EMITIR el token del link del mail. No implica que la persona
              haya visto la app — hasta el 9/9/2026 muchas terminaban en "El
              enlace venció". Decirlo acá es la diferencia entre leer el
              gráfico bien o al revés. */}
          <p className="text-[11px] text-white/30">
            &ldquo;Sesión creada&rdquo; es el token que emite el link del mail,
            no una visita: se marca aunque la persona no haya llegado a ver
            nada.
          </p>

          {perdidos.length > 0 && (
            <details className="group rounded-lg border border-white/10 bg-white/5">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 p-3 text-xs font-semibold text-white/80 hover:text-white">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40 transition-transform group-open:rotate-90" />
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                Quedaron sin negocio
                {/* Cuenta los que de verdad son pérdidas: las pruebas están
                    en la lista para poder desmarcarlas, no para sumar. */}
                <span className="ml-auto tabular-nums font-normal text-white/40">
                  {perdidos.filter((u) => !u.esPrueba).length}
                </span>
              </summary>

              <ul className="space-y-1.5 border-t border-white/10 p-3">
                {perdidos.map((u) => (
                  <li
                    key={u.id}
                    className={`flex items-center justify-between gap-2 text-[11px] ${
                      u.esPrueba ? "opacity-40" : ""
                    }`}
                  >
                    <MarcarPruebaBoton
                      usuarioId={u.id}
                      esPrueba={u.esPrueba}
                      deducida={u.pruebaDeducida}
                    />
                    <span className="min-w-0 flex-1 truncate text-white/70">
                      {u.email}
                    </span>
                    <span className="shrink-0 tabular-nums text-white/35">
                      {u.sesionSoloDelLink
                        ? "abrió el mail, no volvió"
                        : ETIQUETA_ETAPA[u.etapa]}
                      {u.diasEstancado !== null && ` · ${u.diasEstancado}d`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Minutos crudos no se leen: "2 días" sí. */
function formatearEspera(minutos: number): string {
  if (minutos < 1) return "menos de un minuto";
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 60 * 24) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / (60 * 24))} d`;
}
