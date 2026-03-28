"use client";

import { Button } from "@/components/ui/button";
import { Toast, useToast } from "@/components/ui/toast";

export function DashboardActions() {
  const { toast, show, dismiss } = useToast();

  return (
    <>
      <Button
        variant="accent"
        onClick={() => show("Proximamente — estamos construyendo esta funcionalidad.")}
      >
        + Nuevo proyecto
      </Button>

      <div className="mt-4">
        <WhatsAppShare />
      </div>

      <Toast message={toast.message} visible={toast.visible} onDismiss={dismiss} />
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
