"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { GradeBandPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuestionBox, TipCallout } from "@/components/ui/callout";
import {
  BLOQUE_TIPO_LABEL,
  faseSummaryLine,
  splitParagraphs,
  type Bloque,
  type ReadBloque,
  type VarianteGrado,
} from "@/lib/clase-viva/bloques";
import { BLOQUE_ICON, ETAPA_ICON } from "@/lib/clase-viva/etapa-icons";
import type { LoadedPhase } from "@/lib/projects/load-project";

/**
 * One Clase Viva fase. Layout, not boxes (DR8): inside the card only the
 * gran pregunta (blue question box) and the "Profe" tip are contained; blocks
 * are label rows + paragraphs separated by whitespace, grade bands are rows
 * separated by hairlines.
 *
 *   ┌ header button (≥48px, aria-expanded) — FASE N · icon · nombre · summary line
 *   ├ GranPregunta (question box)            ← if gran_pregunta
 *   ├ BloqueBlock × n  (label · paragraphs · bands · tip)
 *   └ Completar (primary, only current fase in en_ensenanza) | Marcar como pendiente (ghost)
 */
export function PhaseSection({
  phase,
  isOpen,
  isCurrent,
  canComplete,
  isPending,
  onToggle,
  onComplete,
  children,
}: {
  phase: LoadedPhase;
  isOpen: boolean;
  isCurrent: boolean;
  /** Show the primary "Completar" (current fase while teaching). */
  canComplete: boolean;
  isPending: boolean;
  onToggle: () => void;
  onComplete: (done: boolean) => void;
  /** Rendered above the fase body (e.g. the tarea previa callout before fase 1). */
  children?: React.ReactNode;
}) {
  const completed = !!phase.completed_at;
  const Icon = ETAPA_ICON[phase.etapa];
  const summary = faseSummaryLine(phase);
  const bodyId = `fase-${phase.orden}-body`;

  return (
    <div
      id={`fase-${phase.orden}`}
      data-current={isCurrent || undefined}
      className={`scroll-mt-4 overflow-hidden rounded-2xl bg-card-bg ${
        isCurrent && !completed ? "border-2 border-black" : "border-[1.5px] border-border"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            <Icon size={14} aria-hidden />
            <span>Fase {phase.orden}</span>
            {completed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-bold text-brand-blue">
                <Check size={10} aria-hidden /> Completada
              </span>
            ) : null}
          </p>
          <p className="text-lg font-semibold leading-snug">{phase.nombre}</p>
          {!isOpen && summary ? (
            <p data-testid="fase-summary" className="mt-0.5 truncate text-sm text-text-secondary">
              {summary}
            </p>
          ) : null}
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-text-secondary transition-transform duration-200 ease-out ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div id={bodyId} className="space-y-5 border-t border-border px-4 py-4">
          {children}
          {phase.gran_pregunta ? <QuestionBox eyebrow="Gran pregunta del día" question={phase.gran_pregunta} /> : null}
          {phase.bloques.map((b, i) => (
            <BloqueBlock key={i} bloque={b} />
          ))}
          <div className="no-print">
            {completed ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onComplete(false)}
                disabled={isPending}
                className="min-h-11 w-full"
              >
                Marcar como pendiente
              </Button>
            ) : canComplete ? (
              <Button variant="primary" onClick={() => onComplete(true)} disabled={isPending} className="w-full">
                Completar Fase {phase.orden}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BloqueBlock({ bloque }: { bloque: ReadBloque }) {
  if (bloque.tipo === "invalido") {
    const Icon = BLOQUE_ICON.invalido;
    return (
      <p data-bloque="invalido" className="print-keep flex items-start gap-2 text-sm text-text-secondary">
        <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Este bloque no se pudo mostrar. Puedes{" "}
          <Link href="/proyectos/nuevo" className="font-semibold text-brand-blue underline">
            volver a generar el proyecto
          </Link>
          .
        </span>
      </p>
    );
  }
  const b = bloque as Bloque;
  const Icon = BLOQUE_ICON[b.tipo];
  return (
    <section data-bloque={b.tipo} className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        <Icon size={14} aria-hidden />
        {b.titulo || BLOQUE_TIPO_LABEL[b.tipo]}
      </h4>
      <div className="print-keep space-y-2 text-[15px] leading-relaxed">
        {splitParagraphs(b.contenido).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {b.variantes_por_grado && b.variantes_por_grado.length > 0 ? (
        <GradeBandTable variantes={b.variantes_por_grado} />
      ) : null}
      {b.tip_profe ? <TipCallout text={b.tip_profe} /> : null}
    </section>
  );
}

/**
 * Grade bands. At phone width: stacked rows (pill on its own line, text below,
 * hairline between). From sm (640px): a semantic two-column table.
 */
export function GradeBandTable({ variantes }: { variantes: VarianteGrado[] }) {
  const sorted = [...variantes].sort((a, b) => Math.min(...a.grados) - Math.min(...b.grados));
  return (
    <div data-testid="grade-bands">
      <div className="divide-y divide-border sm:hidden">
        {sorted.map((v, i) => (
          <div key={i} className="print-keep space-y-1.5 py-3 first:pt-1">
            <GradeBandPill grados={v.grados} />
            <div className="space-y-1.5 text-[15px] leading-relaxed">
              {splitParagraphs(v.contenido).map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <table className="hidden w-full text-[15px] sm:table">
        <tbody>
          {sorted.map((v, i) => (
            <tr key={i} className="print-keep border-t border-border first:border-t-0">
              <th scope="row" className="w-36 py-3 pr-3 text-left align-top font-normal">
                <GradeBandPill grados={v.grados} />
              </th>
              <td className="space-y-1.5 py-3 leading-relaxed">
                {splitParagraphs(v.contenido).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
