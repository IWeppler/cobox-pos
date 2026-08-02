import { CrearNegocioForm } from "@/features/auth/ui/crear-negocio-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Crear negocio | Comerz",
};

export default function CrearNegocioPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Creá tu negocio</h1>
          <p className="text-sm text-muted-foreground">
            Quedás como dueño, con acceso total. Después podés invitar a tu
            equipo desde Configuración.
          </p>
        </div>

        <CrearNegocioForm />
      </div>
    </main>
  );
}
