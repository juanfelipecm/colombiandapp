"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DashboardActions() {
  const router = useRouter();

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => router.push("/proyectos/nuevo")}
      >
        + Nuevo proyecto
      </Button>

      <div className="mt-4">
        <WhatsAppShare />
      </div>
    </>
  );
}

function WhatsAppShare() {
  const handleShare = () => {
    const text = "Mira esta app para maestros rurales: Colombiando te ayuda a planificar tus clases. " + window.location.origin;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <button
      onClick={handleShare}
      className="text-sm font-medium text-brand-blue"
    >
      Compartir con otros maestros
    </button>
  );
}
