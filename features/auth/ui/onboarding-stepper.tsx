"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import {
  registrarseAction,
  type RegistroState,
} from "@/features/auth/actions/registro";
import { crearNegocioAction } from "@/features/auth/actions/negocios";
import { CONDICIONES_IVA, RUBROS, TAMANOS_EQUIPO } from "@/shared/lib/rubros";

const estadoRegistro: RegistroState = { error: "" };
const estadoNegocio = { error: null as string | null, success: false };

/**
 * Alta completa en 3 pasos: cuenta → negocio → perfil fiscal.
 *
 * Por qué el paso 1 se manda SOLO y no todo junto al final: crear el negocio
 * necesita una sesión (la RPC corta sin `auth.uid()`), así que la cuenta tiene
 * que existir antes. Y tiene un efecto secundario bueno: si abandona en el
 * paso 2, la cuenta ya está y al volver retoma donde dejó en vez de empezar de
 * cero — por eso `yaAutenticado` arranca directo en el paso 2.
 *
 * Por qué NO hay paso de plan: el trial desbloquea todo igual, así que elegir
 * plan acá es una decisión sin consecuencia, tomada en el momento de menor
 * información. Los planes se muestran cuando la prueba está por vencer.
 */
export function OnboardingStepper({
  yaAutenticado,
}: Readonly<{ yaAutenticado: boolean }>) {
  const [paso, setPaso] = useState(yaAutenticado ? 2 : 1);
  const router = useRouter();

  const [registro, accionRegistro, registrando] = useActionState(
    registrarseAction,
    estadoRegistro,
  );
  const [negocio, accionNegocio, creando] = useActionState(
    crearNegocioAction,
    estadoNegocio,
  );

  // Datos del paso 2, sostenidos en el cliente hasta el submit final: el
  // negocio se crea de una sola vez, con o sin los fiscales del paso 3.
  const [datosNegocio, setDatosNegocio] = useState({
    nombre: "",
    rubro: "",
    tamano_equipo: "",
    whatsapp: "",
  });

  // Avanzar de paso cuando el registro salió bien se hace DURANTE el render y
  // no en un efecto: un setState dentro de useEffect dispara un render en
  // cascada (React lo desaconseja explícitamente y el linter lo marca). Mismo
  // patrón que usa search-bar.tsx para resincronizar con la URL.
  // `registroConsumido` es lo que evita que se repita en cada render.
  const [registroConsumido, setRegistroConsumido] = useState(false);
  if (registro.success && registro.destino && !registroConsumido) {
    setRegistroConsumido(true);
    setPaso(2);
  }

  useEffect(() => {
    if (negocio.success) {
      router.push("/");
      router.refresh();
    }
  }, [negocio.success, router]);

  // Confirmación por email prendida: no hay sesión, así que no se puede seguir
  // al paso 2. Se dice qué pasó en vez de dejar la pantalla muda.
  if (registro.aviso) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Revisá tu correo</h2>
        <p className="mt-2 text-sm text-muted-foreground">{registro.aviso}</p>
      </div>
    );
  }

  const cargando = registrando || creando || negocio.success;

  return (
    <div className="space-y-6">
      <Progreso paso={paso} />

      {paso === 1 && (
        <form action={accionRegistro} className="space-y-4" aria-busy={registrando}>
          <Encabezado
            titulo="Creá tu cuenta"
            detalle="Con esto entrás vos. Después configuramos el comercio."
          />
          <Campo id="nombre" label="Tu nombre" autoComplete="name" required disabled={registrando} />
          <Campo id="email" label="Email" type="email" autoComplete="email" required disabled={registrando} />
          <Campo
            id="password"
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            disabled={registrando}
            ayuda="Mínimo 6 caracteres."
          />
          <Error mensaje={registro.error} />
          <Button type="submit" disabled={registrando} className="h-11 w-full">
            {registrando ? <Loader2 className="size-4 animate-spin" /> : "Continuar"}
          </Button>
        </form>
      )}

      {paso === 2 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPaso(3);
          }}
        >
          <Encabezado
            titulo="Tu negocio"
            detalle="Con esto armamos tu catálogo y tu punto de venta."
          />

          <div className="space-y-2">
            <Label htmlFor="nombre-negocio">Nombre del negocio</Label>
            <Input
              id="nombre-negocio"
              required
              value={datosNegocio.nombre}
              onChange={(e) =>
                setDatosNegocio((d) => ({ ...d, nombre: e.target.value }))
              }
              placeholder="Evens Indumentaria"
              className="h-11 bg-background shadow-none"
            />
            <p className="text-xs text-muted-foreground">
              Es el que ven tus clientes en la tienda online.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rubro">¿A qué se dedica?</Label>
            <select
              id="rubro"
              required
              value={datosNegocio.rubro}
              onChange={(e) =>
                setDatosNegocio((d) => ({ ...d, rubro: e.target.value }))
              }
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Elegí un rubro</option>
              {RUBROS.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              ¿Cuánta gente trabaja ahí?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {TAMANOS_EQUIPO.map((t) => {
                const elegido = datosNegocio.tamano_equipo === t.valor;
                return (
                  <button
                    type="button"
                    key={t.valor}
                    onClick={() =>
                      setDatosNegocio((d) => ({ ...d, tamano_equipo: t.valor }))
                    }
                    aria-pressed={elegido}
                    className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      elegido
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {t.etiqueta}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp de contacto</Label>
            <Input
              id="whatsapp"
              value={datosNegocio.whatsapp}
              onChange={(e) =>
                setDatosNegocio((d) => ({ ...d, whatsapp: e.target.value }))
              }
              placeholder="3492 000000"
              className="h-11 bg-background shadow-none"
            />
            <p className="text-xs text-muted-foreground">
              Por acá te escriben los pedidos desde el catálogo.
            </p>
          </div>

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={!datosNegocio.nombre || !datosNegocio.rubro || !datosNegocio.tamano_equipo}
          >
            Continuar
          </Button>
        </form>
      )}

      {paso === 3 && (
        <form action={accionNegocio} className="space-y-4" aria-busy={cargando}>
          <Encabezado
            titulo="Datos de facturación"
            detalle="Opcional. Si todavía no los tenés a mano, seguí y cargalos después desde Configuración."
          />

          {/* Lo del paso 2 viaja oculto: el negocio se crea de una sola vez. */}
          <input type="hidden" name="nombre" value={datosNegocio.nombre} />
          <input type="hidden" name="rubro" value={datosNegocio.rubro} />
          <input type="hidden" name="tamano_equipo" value={datosNegocio.tamano_equipo} />
          <input type="hidden" name="whatsapp" value={datosNegocio.whatsapp} />

          <Campo id="razon_social" label="Razón social" disabled={cargando} />
          <Campo
            id="cuit"
            label="CUIT"
            disabled={cargando}
            ayuda="Se valida el dígito verificador."
          />

          <div className="space-y-2">
            <Label htmlFor="condicion_iva">Condición frente al IVA</Label>
            <select
              id="condicion_iva"
              name="condicion_iva"
              defaultValue=""
              disabled={cargando}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Prefiero cargarlo después</option>
              {CONDICIONES_IVA.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <Error mensaje={negocio.error} />

          <Button type="submit" disabled={cargando} className="h-11 w-full">
            {cargando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Crear mi comercio"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Empezás con 14 días de prueba, con todo desbloqueado y sin tarjeta.
          </p>
        </form>
      )}

      {paso > (yaAutenticado ? 2 : 1) && !cargando && (
        <button
          type="button"
          onClick={() => setPaso((p) => p - 1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver
        </button>
      )}
    </div>
  );
}

function Progreso({ paso }: Readonly<{ paso: number }>) {
  const pasos = ["Cuenta", "Negocio", "Facturación"];
  return (
    <ol className="flex items-center gap-2">
      {pasos.map((nombre, i) => {
        const numero = i + 1;
        const hecho = numero < paso;
        const actual = numero === paso;
        return (
          <li key={nombre} className="flex flex-1 flex-col gap-1.5">
            <div
              className={`h-1 rounded-full ${
                hecho || actual ? "bg-primary" : "bg-border"
              }`}
            />
            <span
              className={`text-xs ${
                actual ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {nombre}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Encabezado({
  titulo,
  detalle,
}: Readonly<{ titulo: string; detalle: string }>) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detalle}</p>
    </div>
  );
}

function Campo({
  id,
  label,
  ayuda,
  ...props
}: Readonly<
  { id: string; label: string; ayuda?: string } & React.ComponentProps<
    typeof Input
  >
>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} className="h-11 bg-background shadow-none" {...props} />
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  );
}

function Error({ mensaje }: Readonly<{ mensaje: string | null | undefined }>) {
  if (!mensaje) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {mensaje}
    </p>
  );
}
