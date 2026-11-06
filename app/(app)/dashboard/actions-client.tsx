"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { projectHref } from "@/components/ui/project-card";
import { faseProgressLabel } from "@/lib/clase-viva/etapas";
import { formatGradosList } from "@/lib/clase-viva/grados";

type ActiveProject = {
  id: string;
  titulo: string;
  grados: number[];
  phasesCompleted: number;
};

type DashboardPrimaryCtaProps =
  | { state: "first" }
  | { state: "between" }
  | { state: "active"; project: ActiveProject };

export function DashboardPrimaryCta(props: DashboardPrimaryCtaProps) {
  if (props.state === "active") {
    const { project } = props;
    const gradosLabel = project.grados.length > 0 ? formatGradosList(project.grados) : null;
    const faseLabel = faseProgressLabel("en_ensenanza", project.phasesCompleted);
    const meta = [gradosLabel, faseLabel].filter(Boolean).join(" · ");

    return (
      <>
        <Card highlight className="mb-3">
          <div className="py-1 text-center">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Sigue con tu proyecto activo
            </p>
            <h2 className="mb-1 text-base font-semibold">{project.titulo}</h2>
            <p className="mb-4 text-xs text-text-secondary">{meta}</p>
            <LinkButton
              href={projectHref(project.id, "en_ensenanza", project.phasesCompleted)}
              variant="primary"
              size="sm"
            >
              Continuar
            </LinkButton>
          </div>
        </Card>
        <Link
          href="/proyectos/nuevo"
          className="mb-5 block text-center text-sm font-medium text-brand-blue"
        >
          + Nuevo proyecto
        </Link>
      </>
    );
  }

  const heading =
    props.state === "first"
      ? "Crea tu primer proyecto"
      : "¿Creamos un proyecto para esta semana?";
  const ctaLabel =
    props.state === "first" ? "Crear mi primer proyecto" : "+ Nuevo proyecto";

  return (
    <Card highlight className="mb-5">
      <div className="py-2 text-center">
        <h2 className="mb-1 text-lg font-bold">{heading}</h2>
        <p className="mb-4 text-sm text-text-secondary">
          Diseñamos actividades adaptadas a cada grado.
        </p>
        <LinkButton href="/proyectos/nuevo" variant="secondary" size="sm">
          {ctaLabel}
        </LinkButton>
      </div>
    </Card>
  );
}

export function DashboardShareCard() {
  const handleShare = () => {
    const text =
      "Mira esta app para maestros rurales: Colombiando te ayuda a planificar tus clases. " +
      window.location.origin;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="mt-2 rounded-2xl border border-border bg-input-bg p-4 text-center">
      <p className="mb-2 text-xs text-text-secondary">
        ¿Conoces a otro maestro rural?
      </p>
      <button
        onClick={handleShare}
        className="text-sm font-medium text-brand-blue"
      >
        Compartir Colombiando por WhatsApp
      </button>
    </div>
  );
}
