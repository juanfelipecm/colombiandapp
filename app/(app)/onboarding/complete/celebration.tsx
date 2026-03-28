"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function CelebrationContent({ firstName }: { firstName: string }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/dashboard");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-6">
        <Image
          src="/logo-ColombiAndo.png"
          alt="Colombiando"
          width={100}
          height={100}
          className="rounded-2xl"
        />
      </div>
      <div className="mb-2">
        <p className="mb-2 text-xs font-medium text-text-secondary">Paso 3 de 3</p>
        <div className="mx-auto flex w-32 gap-1.5">
          <div className="h-1 flex-1 rounded-full bg-brand-yellow" />
          <div className="h-1 flex-1 rounded-full bg-brand-yellow" />
          <div className="h-1 flex-1 rounded-full bg-brand-yellow" />
        </div>
      </div>
      <h1 className="mt-6 text-2xl font-bold">
        Bienvenida, {firstName}!
      </h1>
      <p className="mt-2 text-base text-text-secondary">
        Tu escuela esta lista.
      </p>
      <p className="mt-1 text-sm text-text-placeholder">
        Redirigiendo al inicio...
      </p>
      <button
        onClick={() => router.push("/dashboard")}
        className="mt-6 text-sm font-medium text-brand-blue"
      >
        Ir al inicio ahora
      </button>
    </div>
  );
}
