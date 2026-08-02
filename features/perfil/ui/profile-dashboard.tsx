"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  Save,
  Loader2,
  User,
  Mail,
  Lock,
  ShieldCheck,
  CreditCard,
  Sparkles,
} from "lucide-react";
import {
  updateProfileAction,
  updatePasswordAction,
} from "../actions/profile-actions";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";
import { Check } from "lucide-react";
import type { PlanDelNegocio } from "@/features/admin/actions/planes-actions";
import {
  NOMBRE_FEATURE,
  precioMensualEfectivo,
  precioPorCiclo,
} from "@/shared/lib/planes";
import { formatearMoneda } from "@/shared/utils/formatters";

interface CuentaFormProps {
  usuario: {
    id: string;
    nombre: string;
    email: string;
  };
  /** Null si la sesión todavía no tiene un negocio resuelto. */
  plan: PlanDelNegocio | null;
}

export function ProfileDashboard({ usuario, plan }: Readonly<CuentaFormProps>) {
  const [isPending, startTransition] = useTransition();
  const [isAnnual, setIsAnnual] = useState(true); // Empieza en true para incentivar el anual
  const handleSaveProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateProfileAction(formData);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleChangePassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await updatePasswordAction(formData);
      if (result.success) {
        toast.success(result.message);
        form.reset();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 w-full space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Mi Cuenta
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestiona tu información personal, seguridad y suscripción.
        </p>
      </div>

      <Tabs defaultValue="perfil" className="w-full">
        {/* Navegación de las pestañas */}
        <TabsList className="grid w-full grid-cols-3 max-w-md bg-muted/50 p-1">
          <TabsTrigger
            value="perfil"
            className="text-xs font-bold uppercase tracking-widest"
          >
            Perfil
          </TabsTrigger>
          <TabsTrigger
            value="seguridad"
            className="text-xs font-bold uppercase tracking-widest"
          >
            Seguridad
          </TabsTrigger>
          <TabsTrigger
            value="plan"
            className="text-xs font-bold uppercase tracking-widest"
          >
            Suscripción
          </TabsTrigger>
        </TabsList>

        {/* ==========================================
            PESTAÑA 1: PERFIL Y CORREO
        ========================================== */}
        <TabsContent value="perfil" className="mt-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <User className="w-5 h-5 text-primary" />
                Información Personal
              </CardTitle>
              <CardDescription>
                Actualiza tu nombre y correo electrónico. Este correo se usará
                para notificaciones y facturación.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveProfile}>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="nombre" className="text-sm font-semibold">
                    Nombre Completo
                  </Label>
                  <Input
                    id="nombre"
                    name="nombre"
                    defaultValue={usuario.nombre}
                    required
                    className="h-11 shadow-none"
                  />
                </div>

                <div className="space-y-2 max-w-md">
                  <Label
                    htmlFor="email"
                    className="text-sm font-semibold flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Correo Electrónico
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={usuario.email}
                    required
                    className="h-11 shadow-none"
                  />
                  <p className="text-xs text-muted-foreground mb-2">
                    Si cambias tu correo, deberás usar el nuevo para iniciar
                    sesión en Comerz.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border/50 pt-6">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Guardar Cambios
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* ==========================================
            PESTAÑA 2: SEGURIDAD (CONTRASEÑA)
        ========================================== */}
        <TabsContent value="seguridad" className="mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Seguridad de la Cuenta
              </CardTitle>
              <CardDescription>
                Asegúrate de usar una contraseña larga y difícil de adivinar.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleChangePassword}>
              <CardContent className="space-y-6 mb-2">
                <div className="space-y-2 max-w-md">
                  <Label
                    htmlFor="current_password"
                    className="text-sm font-semibold"
                  >
                    Contraseña Actual
                  </Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="current_password"
                      name="current_password"
                      type="password"
                      required
                      className="h-11 pl-9 shadow-none"
                    />
                  </div>
                </div>

                <div className="space-y-2 max-w-md pt-2 border-t border-border/50">
                  <Label
                    htmlFor="new_password"
                    className="text-sm font-semibold"
                  >
                    Nueva Contraseña
                  </Label>
                  <Input
                    id="new_password"
                    name="new_password"
                    type="password"
                    required
                    className="h-11 shadow-none"
                  />
                </div>

                <div className="space-y-2 max-w-md">
                  <Label
                    htmlFor="confirm_password"
                    className="text-sm font-semibold"
                  >
                    Confirmar Nueva Contraseña
                  </Label>
                  <Input
                    id="confirm_password"
                    name="confirm_password"
                    type="password"
                    required
                    className="h-11 shadow-none"
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t border-border/50 pt-6">
                <Button type="submit" disabled={isPending} variant="secondary">
                  {isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  Actualizar Contraseña
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* ==========================================
            PESTAÑA 3: PLAN Y SUSCRIPCIÓN
        ========================================== */}
        <TabsContent value="plan" className="mt-6">
          <Card className="border-border shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">
                    Plan Actual
                  </h3>
                  <div className="flex items-center gap-2 text-2xl font-black text-foreground">
                    {plan?.plan ?? "Sin plan asignado"}
                    {plan?.plan && (
                      <Sparkles className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                  {plan && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.negocio}
                      {plan.plan
                        ? ` · ${formatearMoneda(precioMensualEfectivo(plan.precioLista, plan.modalidad))}/mes`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>

            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-6">
                {plan?.descripcion ??
                  "Todavía no hay un plan asignado a este comercio. Mientras tanto no hay límites aplicados."}
              </p>

              <div className="bg-muted/30 rounded-lg p-4 border border-border/50 flex flex-col gap-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Estado de la cuenta
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-xs uppercase tracking-wider ${
                      plan?.estado === "activo"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {plan?.estado ?? "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Modalidad
                  </span>
                  <span className="font-semibold text-foreground capitalize">
                    {plan?.modalidad ?? "—"}
                    {plan?.plan && plan.modalidad === "semestral"
                      ? ` (${formatearMoneda(precioPorCiclo(plan.precioLista, "semestral"))} cada 6 meses)`
                      : ""}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Próximo vencimiento
                  </span>
                  <span className="font-semibold text-foreground">
                    {plan?.vencimiento
                      ? new Date(plan.vencimiento).toLocaleDateString("es-AR")
                      : "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Usuarios
                  </span>
                  <span className="font-semibold text-foreground">
                    {plan?.usuariosUsados ?? 0}
                    {plan?.reglas.max_usuarios
                      ? ` de ${plan.reglas.max_usuarios}`
                      : ""}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Cuenta corriente
                  </span>
                  <span className="font-semibold text-foreground">
                    {plan?.reglas.max_clientes_cuenta_corriente
                      ? `hasta ${plan.reglas.max_clientes_cuenta_corriente} clientes`
                      : "sin tope"}
                  </span>
                </div>
              </div>

              {plan?.reglas.features?.length ? (
                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Incluye
                  </p>
                  <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                    {plan.reglas.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{NOMBRE_FEATURE[f] ?? f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t border-border/50 p-6">
              <Button
                className="w-full sm:w-auto font-bold uppercase tracking-widest text-[11px] h-11"
                variant="outline"
              >
                Gestionar Método de Pago
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
