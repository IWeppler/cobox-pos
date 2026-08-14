"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  errorDeCuit,
  esCuitValido,
  formatearCuitParcial,
  normalizarCuit,
} from "@/shared/lib/cuit";

/**
 * Campo de CUIT con máscara y diagnóstico en vivo.
 *
 * Existe porque el campo suelto fue una barrera real en el alta: se intenta
 * cargar el CUIT, sale "no es válido" y no hay forma de saber si el problema
 * es el formato o el número. La respuesta de la app era la misma en los dos
 * casos, así que se prueba con guiones, sin guiones, con puntos, y ninguna
 * variante cambia nada — porque el formato NUNCA importó (normalizarCuit
 * descarta todo lo que no sea dígito).
 *
 * Tres decisiones que se apoyan entre sí:
 *
 * 1. La máscara pone los guiones sola y corta en 11 dígitos. El formato deja
 *    de ser una pregunta que el usuario tenga que adivinar.
 * 2. El contador de dígitos se ve MIENTRAS se tipea. Es lo que convierte
 *    "algo está mal" en "me falta uno", que es información que se puede usar.
 * 3. El error recién aparece al salir del campo (o si se pasa de 11): marcar
 *    en rojo un CUIT a medio escribir es ruido, no ayuda.
 *
 * Se manda el valor CON guiones al FormData a propósito: el server normaliza
 * igual, y así lo que se envía es idéntico a lo que la persona ve en pantalla.
 */
export function CuitInput({
  id = "cuit",
  name = "cuit",
  label = "CUIT",
  defaultValue,
  required = false,
  disabled = false,
  ayuda = "Se verifica el dígito verificador.",
}: Readonly<{
  id?: string;
  name?: string;
  label?: string;
  defaultValue?: string | null;
  required?: boolean;
  disabled?: boolean;
  ayuda?: string;
}>) {
  const [valor, setValor] = useState(() =>
    formatearCuitParcial(defaultValue ?? ""),
  );
  const [tocado, setTocado] = useState(false);

  const digitos = normalizarCuit(valor);
  const completo = digitos.length === 11;
  const valido = completo && esCuitValido(digitos);
  // Ya con 11 dígitos no hay nada más que esperar: el error se muestra sin
  // exigir que salga del campo.
  const error = tocado || completo ? errorDeCuit(valor) : null;

  const idAyuda = `${id}-ayuda`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-danger"> *</span>}
        </Label>
        {/* El contador solo aparece cuando hay algo escrito y todavía no
            cierra: una vez válido, el tilde dice lo mismo sin números. */}
        {digitos.length > 0 && !valido && (
          <span
            className={`font-mono text-[10px] tabular-nums ${
              error ? "text-danger" : "text-muted-foreground"
            }`}
          >
            {digitos.length}/11
          </span>
        )}
      </div>

      <div className="relative">
        <Input
          id={id}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          placeholder="30-71234567-8"
          required={required}
          disabled={disabled}
          value={valor}
          onChange={(e) => setValor(formatearCuitParcial(e.target.value))}
          onBlur={() => setTocado(true)}
          aria-invalid={Boolean(error)}
          aria-describedby={idAyuda}
          className={`h-10 font-mono shadow-none ${valido ? "pr-9" : ""} ${
            error ? "border-danger focus-visible:ring-danger" : ""
          }`}
        />
        {valido && (
          <Check
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-success"
            aria-hidden
          />
        )}
      </div>

      <p
        id={idAyuda}
        role={error ? "alert" : undefined}
        className={`text-[10px] ${error ? "text-danger" : "text-muted-foreground"}`}
      >
        {error ?? (valido ? "CUIT válido." : ayuda)}
      </p>
    </div>
  );
}
