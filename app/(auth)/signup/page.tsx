"use client";

import { useActionState } from "react";
import { signUp } from "../actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/button";
import Link from "next/link";

export default function SignUpPage() {
  const [state, formAction] = useActionState(signUp, null);

  return (
    <form action={formAction}>
      <h2 className="mb-1 text-xl font-bold">Crear cuenta</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Registrate para comenzar con Colombiando
      </p>

      {state?.error && (
        <div className="mb-4 rounded-xl border border-brand-red/20 bg-brand-red/5 p-3">
          <p className="text-sm text-brand-red">{state.error}</p>
        </div>
      )}

      <Input
        label="Nombres"
        name="first_name"
        type="text"
        placeholder="Ej: Diana"
        required
        autoComplete="given-name"
      />

      <Input
        label="Apellidos"
        name="last_name"
        type="text"
        placeholder="Ej: Molina Rodriguez"
        required
        autoComplete="family-name"
      />

      <Input
        label="Correo electronico"
        name="email"
        type="email"
        placeholder="tu@correo.com"
        required
        autoComplete="email"
      />

      <Input
        label="Contrasena"
        name="password"
        type="password"
        placeholder="Minimo 6 caracteres"
        required
        minLength={6}
        autoComplete="new-password"
      />

      <SubmitButton pendingText="Creando cuenta...">
        Crear cuenta
      </SubmitButton>

      <p className="mt-4 text-center text-sm text-text-secondary">
        Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-brand-blue">
          Iniciar sesion
        </Link>
      </p>
    </form>
  );
}
