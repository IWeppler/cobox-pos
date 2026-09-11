"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Crop, RotateCcw } from "lucide-react";
import {
  normalizarCoordenadaFoco,
  objectPositionDeFoco,
  ventanaVisible,
  type Foco,
} from "@/shared/lib/foco-banner";

/**
 * Elegir qué parte del banner NO se puede recortar.
 *
 * El problema que resuelve: el hero es `object-cover` y recorta desde el
 * centro, así que una foto con la modelo a un costado o el precio abajo pierde
 * justo eso — y desde el panel no había forma de verlo ni de arreglarlo salvo
 * recortar la imagen a mano en otro programa y volver a subirla.
 *
 * Dos decisiones de diseño que importan:
 *
 * 1. **Se muestra la imagen ENTERA con el recorte encima**, no el recorte
 *    solo. Encuadrar es decidir qué se pierde, y para eso hay que ver lo que
 *    se está por perder. Lo de afuera del marco va oscurecido.
 *
 * 2. **La previsualización usa el MISMO cálculo que el catálogo**
 *    (`objectPositionDeFoco`), no uno parecido. Si el panel dibujara el
 *    encuadre por su cuenta, la dueña ajustaría contra un marco que no es el
 *    que va a ver la clienta, que es peor que no tener la herramienta.
 *
 * No toca la base: devuelve el foco y quien lo abrió decide cuándo guardar.
 * Mismo criterio que el resto del panel de banner, donde se guarda todo junto.
 */
type PropsEncuadre = {
  url: string;
  /** Ancho/alto del marco contra el que se encuadra. */
  forma: { ancho: number; alto: number };
  etiquetaForma: string;
  foco: Foco | null;
  onGuardar: (foco: { x: number | null; y: number | null }) => void;
};

export function EncuadreBannerModal({
  abierto,
  onOpenChange,
  ...props
}: Readonly<PropsEncuadre & {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}>) {
  // El cuerpo va en su propio componente y se MONTA con el modal: así el
  // borrador se inicializa del foco guardado por construcción, sin un efecto
  // que sincronice estado con props. Un modal que conserva el borrador de la
  // vez anterior le muestra a la persona un encuadre que la tienda no tiene.
  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <CuerpoEncuadre {...props} onCerrar={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CuerpoEncuadre({
  url,
  forma,
  etiquetaForma,
  foco,
  onGuardar,
  onCerrar,
}: Readonly<PropsEncuadre & { onCerrar: () => void }>) {
  const lienzoRef = useRef<HTMLDivElement>(null);
  const [borrador, setBorrador] = useState<Foco>(() => ({
    x: foco?.x ?? null,
    y: foco?.y ?? null,
  }));
  const [arrastrando, setArrastrando] = useState(false);
  // Proporción real de la imagen. Hasta que carga no se sabe, y sin ella el
  // rectángulo del recorte sería inventado (ver `ventanaVisible`).
  const [proporcionImagen, setProporcionImagen] = useState(0);

  const proporcionMarco = forma.ancho / forma.alto;
  const ventana = ventanaVisible({
    proporcionImagen,
    proporcionMarco,
    foco: borrador,
  });

  const posicionar = (clientX: number, clientY: number) => {
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!caja || caja.width === 0 || caja.height === 0) return;

    setBorrador({
      x: normalizarCoordenadaFoco(((clientX - caja.left) / caja.width) * 100),
      y: normalizarCoordenadaFoco(((clientY - caja.top) / caja.height) * 100),
    });
  };

  const estiloPreview = { objectPosition: objectPositionDeFoco(borrador) };

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-primary" />
            Encuadrar el banner
          </DialogTitle>
          <DialogDescription>
            Tocá sobre la foto la parte que no se puede perder. Lo que queda
            oscuro es lo que se recorta en {etiquetaForma}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* El lienzo: la imagen entera, y encima el marco de lo que entra. */}
          <div
            ref={lienzoRef}
            className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/30 cursor-crosshair touch-none select-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setArrastrando(true);
              posicionar(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (arrastrando) posicionar(e.clientX, e.clientY);
            }}
            onPointerUp={() => setArrastrando(false)}
            onPointerCancel={() => setArrastrando(false)}
          >
            {/* `<img>` nativo y no `next/image`, igual que el banner del
                catálogo: el optimizador global está apagado, así que
                `next/image` sería una envoltura sin efecto. Y acá interesa ver
                la foto COMPLETA y sin recomprimir — es lo que se está por
                recortar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Banner"
              className="w-full h-auto block pointer-events-none"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalHeight > 0) {
                  setProporcionImagen(img.naturalWidth / img.naturalHeight);
                }
              }}
            />

            {/* Cuatro paños oscuros alrededor de la ventana, en vez de un
                borde: lo que se pierde tiene que VERSE que se pierde. */}
            <div
              className="absolute inset-x-0 top-0 bg-background/70 pointer-events-none"
              style={{ height: `${ventana.y}%` }}
            />
            <div
              className="absolute inset-x-0 bottom-0 bg-background/70 pointer-events-none"
              style={{ height: `${100 - ventana.y - ventana.alto}%` }}
            />
            <div
              className="absolute left-0 bg-background/70 pointer-events-none"
              style={{
                top: `${ventana.y}%`,
                height: `${ventana.alto}%`,
                width: `${ventana.x}%`,
              }}
            />
            <div
              className="absolute right-0 bg-background/70 pointer-events-none"
              style={{
                top: `${ventana.y}%`,
                height: `${ventana.alto}%`,
                width: `${100 - ventana.x - ventana.ancho}%`,
              }}
            />

            <div
              className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)] pointer-events-none"
              style={{
                left: `${ventana.x}%`,
                top: `${ventana.y}%`,
                width: `${ventana.ancho}%`,
                height: `${ventana.alto}%`,
              }}
            />

            <div
              className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white bg-primary/80 shadow pointer-events-none"
              style={{
                left: `${borrador.x ?? 50}%`,
                top: `${borrador.y ?? 50}%`,
              }}
            />
          </div>

          {/* Cómo va a quedar de verdad. Es la prueba de que el marco de arriba
              no miente: el mismo foco, aplicado como lo aplica el catálogo. */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Así se va a ver en {etiquetaForma}
            </p>
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-lg border border-border"
              style={{ aspectRatio: `${forma.ancho} / ${forma.alto}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Vista previa del banner"
                className="w-full h-full object-cover"
                style={estiloPreview}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setBorrador({ x: null, y: null })}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Volver al centro
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCerrar}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onGuardar({
                  x: normalizarCoordenadaFoco(borrador.x),
                  y: normalizarCoordenadaFoco(borrador.y),
                });
                onCerrar();
              }}
            >
              Usar este encuadre
            </Button>
          </div>
        </DialogFooter>
    </>
  );
}
