"use client";

import { useActionState } from "react";
import { signIn } from "../actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/button";
import Link from "next/link";

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, null);

  return (
    <form action={formAction}>
      <h2 className="mb-1 text-xl font-bold">Iniciar sesion</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Ingresa a tu cuenta de Colombiando
      </p>

      {state?.error && (
        <div className="mb-4 rounded-xl border border-brand-red/20 bg-brand-red/5 p-3">
          <p className="text-sm text-brand-red">{state.error}</p>
        </div>
      )}

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
        placeholder="Tu contrasena"
        required
        autoComplete="current-password"
      />

      <SubmitButton pendingText="Ingresando..." className="w-full">
        Iniciar sesion
      </SubmitButton>

      <p className="mt-4 text-center text-sm text-text-secondary">
        No tienes cuenta?{" "}
        <Link href="/signup" className="font-medium text-brand-blue">
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
