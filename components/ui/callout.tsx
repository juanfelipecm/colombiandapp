import { CircleQuestionMark, ClipboardList, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { splitParagraphs } from "@/lib/clase-viva/bloques";

/**
 * Callouts for the project view (DESIGN.md alert pattern: tinted bg + left
 * border + Lucide prefix). Colour roles in the plan view:
 *   question → blue info tint (pregunta guía, gran pregunta del día)
 *   tip      → yellow (the "Profe, …" box)
 *   warning  → yellow + clipboard (tarea antes de empezar, recovery states)
 * The yellow speech bubble stays reserved for the AI moment (NextStepHero).
 */
type Variant = "question" | "tip" | "warning";

const STYLES: Record<Variant, { box: string; icon: LucideIcon; iconClass: string; eyebrow: string }> = {
  question: {
    box: "border-[1.5px] border-brand-blue/40 bg-[#DDEEFF]",
    icon: CircleQuestionMark,
    iconClass: "text-brand-blue",
    eyebrow: "text-brand-blue",
  },
  tip: {
    box: "border-l-4 border-brand-yellow bg-[var(--grade-1-bg)]",
    icon: Lightbulb,
    iconClass: "text-[var(--grade-1-text)]",
    eyebrow: "text-[var(--grade-1-text)]",
  },
  warning: {
    box: "border-l-4 border-brand-yellow bg-[var(--grade-1-bg)]",
    icon: TriangleAlert,
    iconClass: "text-[var(--grade-1-text)]",
    eyebrow: "text-[var(--grade-1-text)]",
  },
};

export function Callout({
  variant,
  eyebrow,
  icon,
  emphasis = false,
  children,
  className = "",
}: {
  variant: Variant;
  eyebrow?: string;
  icon?: LucideIcon;
  /** Question callouts render their body as a 16px semibold question. */
  emphasis?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const s = STYLES[variant];
  const Icon = icon ?? s.icon;
  return (
    <div data-callout={variant} className={`print-keep rounded-xl px-4 py-3 ${s.box} ${className}`}>
      {eyebrow ? (
        <p className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${s.eyebrow}`}>
          <Icon size={14} aria-hidden className={s.iconClass} />
          {eyebrow}
        </p>
      ) : null}
      <div className={`flex gap-2 ${emphasis ? "text-base font-semibold leading-relaxed" : "text-[15px] leading-relaxed"}`}>
        {eyebrow ? null : <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${s.iconClass}`} />}
        <div className="min-w-0 space-y-2">{children}</div>
      </div>
    </div>
  );
}

/** "Profe, …" tip, rendered verbatim (the model's text already starts with "Profe,"). */
export function TipCallout({ text }: { text: string }) {
  return (
    <Callout variant="tip">
      {splitParagraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </Callout>
  );
}

export function QuestionBox({ eyebrow, question }: { eyebrow: string; question: string }) {
  return (
    <Callout variant="question" eyebrow={eyebrow} emphasis>
      <p>{question}</p>
    </Callout>
  );
}

export function TareaPreviaCallout({ text }: { text: string }) {
  return (
    <Callout variant="warning" eyebrow="Tarea antes de empezar" icon={ClipboardList}>
      {splitParagraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </Callout>
  );
}
