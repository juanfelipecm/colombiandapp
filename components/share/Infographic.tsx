// Refactored for Satori (no className/stylesheet — every style is inline).
// Satori does not support pseudo-elements, CSS variables, CSS columns, grid,
// tables or stylesheets; every element with more than one child is a flex box
// and every text node is the only child of its element. Colors come from
// lib/share-render/tokens.ts so brand vs grade hex values can't get conflated.
//
// Two modes (D10):
//   compact (share image, WhatsApp overview)       full (PDF)
//   ─ Cover (logo, título, grados·áreas, pregunta)  ─ Cover
//   ─ Tarea previa ≤140 chars                       ─ Tarea previa
//   ─ 5 rows: numeral · etapa · summary line        ─ 5 fases: gran pregunta, bloques, bands, tips
//   ─ DBA: one line per materia                     ─ DBA por grado tables per materia
//   ─ Footer "PLAN COMPLETO EN EL PDF"              ─ Materiales · Footer
/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import type { ShareData, SharePhase, ShareTargetsByMateria } from "@/lib/share-render/load-project";
import {
  BLOQUE_TIPO_LABEL,
  faseSummaryLine,
  splitParagraphs,
  truncate,
  type Bloque,
  type ReadBloque,
} from "@/lib/clase-viva/bloques";
import { ETAPA_META, TOTAL_FASES } from "@/lib/clase-viva/etapas";
import { formatGrado, formatGradosBand, formatGradosList } from "@/lib/clase-viva/grados";
import { fitTitulo, fitPreguntaGuia } from "@/lib/share-render/text-fit";
import { tokens, gradeBg, gradeText, phaseColor } from "@/lib/share-render/tokens";

const FONT = "Montserrat";
export const COMPACT_TAREA_MAX = 140;
export const COMPACT_FASE_LINE_MAX = 90;

type InfographicProps = {
  data: ShareData;
  logoDataUrl: string;
  generatedAtLabel: string;
  softCapped: boolean;
  /** Share image = compact overview; PDF = full plan. */
  compact?: boolean;
};

export function Infographic({ data, logoDataUrl, generatedAtLabel, softCapped, compact = false }: InfographicProps) {
  return (
    <div
      style={{
        width: 1080,
        display: "flex",
        flexDirection: "column",
        background: tokens.surface,
        fontFamily: FONT,
        color: tokens.black,
      }}
    >
      <FlagBar />
      <Cover data={data} logoDataUrl={logoDataUrl} />
      {data.project.tarea_previa ? (
        <TareaPreviaSection
          text={compact ? truncate(data.project.tarea_previa, COMPACT_TAREA_MAX) : data.project.tarea_previa}
        />
      ) : null}
      <PhasesSection phases={data.phases} compact={compact} />
      <DbasSection groups={data.targetsByMateria} compact={compact} />
      {compact ? null : <MaterialesSection items={data.materiales} />}
      <Footer
        logoDataUrl={logoDataUrl}
        generatedAtLabel={generatedAtLabel}
        showPdfNotice={compact || softCapped}
      />
      <FlagBar />
    </div>
  );
}

function FlagBar() {
  return (
    <div style={{ display: "flex", height: 12, width: "100%" }}>
      <div style={{ flex: 2, background: tokens.cYellow }} />
      <div style={{ flex: 1, background: tokens.cBlue }} />
      <div style={{ flex: 1, background: tokens.cRed }} />
    </div>
  );
}

function gradosSubtitle(grados: number[]): string {
  if (grados.length === 0) return "";
  return `Para ${grados.length === 1 && grados[0] !== 0 ? "grado " : ""}${formatGradosList(grados)}`;
}

function gradosRange(grados: number[]): string {
  const sorted = [...grados].sort((a, b) => a - b);
  if (sorted.length <= 2) return formatGradosBand(sorted);
  return `${formatGrado(sorted[0])} a ${formatGrado(sorted[sorted.length - 1])}`;
}

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "32px 56px",
};

const sectionHeadingStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 32,
  color: tokens.cBlue,
  margin: 0,
  marginBottom: 20,
  letterSpacing: "-0.01em",
};

const eyebrowStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: tokens.muted,
  margin: 0,
};

function Paragraphs({ text, size = 20, color = tokens.black }: { text: string; size?: number; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {splitParagraphs(text).map((p, i, arr) => (
        <div
          key={i}
          style={{ fontSize: size, lineHeight: 1.45, color, margin: 0, marginBottom: i === arr.length - 1 ? 0 : 10 }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

function Cover({ data, logoDataUrl }: { data: ShareData; logoDataUrl: string }) {
  const { project, grados, studentCount, materias } = data;
  const tituloSize = fitTitulo(project.titulo);
  const preguntaSize = fitPreguntaGuia(project.pregunta_guia);
  const areas = materias.map((m) => m.nombre).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "40px 56px 48px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <img src={logoDataUrl} alt="Colombiando" width={318} height={64} style={{ height: 64, width: 318 }} />
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: tokens.cBlue,
            lineHeight: 1,
            paddingTop: 12,
          }}
        >
          PLAN DE PROYECTO · CLASE VIVA
        </div>
      </div>

      <h1
        style={{
          fontWeight: 700,
          fontSize: tituloSize,
          letterSpacing: "-0.02em",
          color: tokens.black,
          lineHeight: 1.05,
          margin: 0,
          marginBottom: 12,
        }}
      >
        {project.titulo}
      </h1>
      <div style={{ fontWeight: 600, fontSize: 22, color: tokens.muted, margin: 0, marginBottom: areas ? 6 : 32 }}>
        {gradosSubtitle(grados)}
      </div>
      {areas ? (
        <div style={{ fontWeight: 400, fontSize: 20, color: tokens.muted, margin: 0, marginBottom: 32 }}>
          {`Áreas: ${areas}`}
        </div>
      ) : null}

      <Bubble preguntaGuia={project.pregunta_guia} preguntaSize={preguntaSize} />

      <div style={{ display: "flex", flexDirection: "row", gap: 16 }}>
        <Pill bg={tokens.cYellow}>
          <span>{gradosRange(grados)}</span>
        </Pill>
        <Pill bg={tokens.cBlue}>
          <LayersIcon />
          <span style={{ marginLeft: 8 }}>{`${TOTAL_FASES} fases`}</span>
        </Pill>
        <Pill bg={tokens.cGreen}>
          <UsersIcon />
          <span style={{ marginLeft: 8 }}>{`${studentCount} ${studentCount === 1 ? "niño" : "niños"}`}</span>
        </Pill>
      </div>
    </div>
  );
}

function Bubble({ preguntaGuia, preguntaSize }: { preguntaGuia: string; preguntaSize: number }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: tokens.cYellow,
        borderBottom: `4px solid ${tokens.black}`,
        borderRadius: 16,
        padding: "24px 28px 26px",
        marginBottom: 36,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          fontWeight: 700,
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: tokens.black,
          margin: 0,
          marginBottom: 12,
        }}
      >
        <SparklesIcon />
        <span>PREGUNTA GUÍA</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: preguntaSize, color: tokens.black, lineHeight: 1.25, margin: 0 }}>
        {preguntaGuia}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: -20,
          left: 38,
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderTop: `16px solid ${tokens.black}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -16,
          left: 40,
          width: 0,
          height: 0,
          borderLeft: "12px solid transparent",
          borderRight: "12px solid transparent",
          borderTop: `16px solid ${tokens.cYellow}`,
        }}
      />
    </div>
  );
}

function Pill({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 9999,
        borderBottom: `6px solid ${tokens.black}`,
        padding: "12px 22px",
        fontWeight: 700,
        fontSize: 18,
        color: tokens.black,
        lineHeight: 1,
        background: bg,
      }}
    >
      {children}
    </div>
  );
}

function TareaPreviaSection({ text }: { text: string }) {
  return (
    <div style={sectionStyle}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: tokens.grade1Bg,
          borderLeft: `6px solid ${tokens.cYellow}`,
          borderRadius: 12,
          padding: "20px 24px",
        }}
      >
        <div style={{ ...eyebrowStyle, color: tokens.grade1Text, marginBottom: 8 }}>TAREA ANTES DE EMPEZAR</div>
        <Paragraphs text={text} />
      </div>
    </div>
  );
}

function PhasesSection({ phases, compact }: { phases: SharePhase[]; compact: boolean }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>{`Las ${TOTAL_FASES} fases`}</h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {phases.map((p) =>
          compact ? <PhaseRow key={p.orden} phase={p} /> : <PhaseBlock key={p.orden} phase={p} />,
        )}
      </div>
    </div>
  );
}

/** Compact overview row: muted numeral + hairline, etapa eyebrow, per-project summary line (DR4). */
function PhaseRow({ phase }: { phase: SharePhase }) {
  const color = phaseColor(phase.orden);
  const line = faseSummaryLine(phase, COMPACT_FASE_LINE_MAX);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 28,
        paddingBottom: 18,
        marginBottom: 18,
        borderBottom: `2px solid ${color}`,
      }}
    >
      <div style={{ fontWeight: 400, fontSize: 88, lineHeight: 1, color, width: 72, letterSpacing: "-0.04em" }}>
        {String(phase.orden)}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: 6 }}>
        <div style={{ ...eyebrowStyle, marginBottom: 8 }}>{ETAPA_META[phase.etapa].nombre}</div>
        <div style={{ fontWeight: 700, fontSize: 26, lineHeight: 1.3, color: tokens.black }}>{line}</div>
      </div>
    </div>
  );
}

function PhaseBlock({ phase }: { phase: SharePhase }) {
  const color = phaseColor(phase.orden);
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 40, paddingBottom: 4 }}>
      <div style={{ ...eyebrowStyle, color, marginBottom: 4, lineHeight: 1 }}>{`FASE ${phase.orden}`}</div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 96,
          color: tokens.black,
          lineHeight: 1,
          margin: 0,
          letterSpacing: "-0.04em",
        }}
      >
        {String(phase.orden)}
      </div>
      <div style={{ height: 4, width: "100%", margin: "8px 0 16px", background: color }} />
      <div style={{ fontWeight: 700, fontSize: 28, color: tokens.black, margin: 0, marginBottom: 16, lineHeight: 1.1 }}>
        {phase.nombre}
      </div>
      {phase.gran_pregunta ? <GranPregunta text={phase.gran_pregunta} /> : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {phase.bloques.map((b, i) => (
          <ShareBloque key={i} bloque={b} />
        ))}
      </div>
    </div>
  );
}

function GranPregunta({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#DDEEFF",
        borderRadius: 12,
        padding: "18px 22px",
        marginBottom: 20,
      }}
    >
      <div style={{ ...eyebrowStyle, color: tokens.cBlue, marginBottom: 8 }}>GRAN PREGUNTA DEL DÍA</div>
      <div style={{ fontWeight: 600, fontSize: 24, lineHeight: 1.3, color: tokens.black }}>{text}</div>
    </div>
  );
}

function ShareBloque({ bloque }: { bloque: ReadBloque }) {
  if (bloque.tipo === "invalido") {
    return (
      <div style={{ fontSize: 18, color: tokens.muted, marginBottom: 18 }}>
        Este bloque no se pudo mostrar.
      </div>
    );
  }
  const b = bloque as Bloque;
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 22 }}>
      <div style={{ ...eyebrowStyle, marginBottom: 8 }}>{(b.titulo || BLOQUE_TIPO_LABEL[b.tipo]).toUpperCase()}</div>
      <Paragraphs text={b.contenido} />
      {b.variantes_por_grado && b.variantes_por_grado.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
          {[...b.variantes_por_grado]
            .sort((x, y) => Math.min(...x.grados) - Math.min(...y.grados))
            .map((v, i) => {
              const first = Math.min(...v.grados);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: 20,
                    padding: "12px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${tokens.hairline}`,
                  }}
                >
                  <div style={{ display: "flex", width: 200 }}>
                    <div
                      style={{
                        display: "flex",
                        borderRadius: 9999,
                        padding: "6px 14px",
                        fontWeight: 700,
                        fontSize: 15,
                        lineHeight: 1,
                        background: gradeBg(first),
                        color: gradeText(first),
                      }}
                    >
                      {formatGradosBand(v.grados)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flex: 1 }}>
                    <Paragraphs text={v.contenido} size={19} />
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}
      {b.tip_profe ? (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 12,
            marginTop: 14,
            background: tokens.grade1Bg,
            borderLeft: `6px solid ${tokens.cYellow}`,
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", color: tokens.grade1Text, paddingTop: 2 }}>
            <LightbulbIcon />
          </div>
          <div style={{ display: "flex", flex: 1 }}>
            <Paragraphs text={b.tip_profe} size={19} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DbasSection({ groups, compact }: { groups: ShareTargetsByMateria; compact: boolean }) {
  if (groups.length === 0) return null;
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>DBA por grado</h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {groups.map((g) =>
          compact ? (
            <div key={g.materia_id} style={{ fontSize: 22, lineHeight: 1.4, marginBottom: 8, color: tokens.black }}>
              {`${g.materia_nombre} · ${g.rows.length} DBA en ${new Set(g.rows.map((r) => r.grado)).size} ${
                new Set(g.rows.map((r) => r.grado)).size === 1 ? "grado" : "grados"
              }`}
            </div>
          ) : (
            <div key={g.materia_id} style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
              <div style={{ fontWeight: 700, fontSize: 24, marginBottom: 12, color: tokens.black }}>{g.materia_nombre}</div>
              {g.rows.map((r, idx) => (
                <div
                  key={`${g.materia_id}-${r.grado}-${idx}`}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: 16,
                    alignItems: "flex-start",
                    padding: "10px 0",
                    borderTop: idx === 0 ? "none" : `1px solid ${tokens.hairline}`,
                  }}
                >
                  <div style={{ display: "flex", width: 150, paddingTop: 2 }}>
                    <ShareGradeBadge grade={r.grado} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 20, lineHeight: 1.45, color: tokens.black }}>
                      {`DBA #${r.dba_numero} — ${r.enunciado}`}
                    </div>
                    {r.evidencia && g.materia_slug !== "ingles" ? (
                      <div style={{ fontSize: 17, lineHeight: 1.4, color: tokens.muted, marginTop: 4 }}>
                        {`Evidencia: ${r.evidencia}`}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function MaterialesSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  // Two-column flex (Satori has no `columns: 2`).
  const half = Math.ceil(items.length / 2);
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Materiales</h2>
      <div style={{ display: "flex", flexDirection: "row", gap: 32 }}>
        <MaterialesColumn items={items.slice(0, half)} />
        <MaterialesColumn items={items.slice(half)} />
      </div>
    </div>
  );
}

function MaterialesColumn({ items }: { items: string[] }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {items.map((m, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "row", marginBottom: 10, fontSize: 20, lineHeight: 1.4 }}>
          <span style={{ marginRight: 10 }}>•</span>
          <span style={{ flex: 1 }}>{m}</span>
        </div>
      ))}
    </div>
  );
}

function Footer({
  logoDataUrl,
  generatedAtLabel,
  showPdfNotice,
}: {
  logoDataUrl: string;
  generatedAtLabel: string;
  showPdfNotice: boolean;
}) {
  return (
    <footer style={{ display: "flex", flexDirection: "column", padding: "32px 56px 24px" }}>
      {showPdfNotice ? (
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: tokens.cBlue,
            margin: 0,
            marginBottom: 16,
          }}
        >
          PLAN COMPLETO EN EL PDF · descárgalo desde la app
        </div>
      ) : null}
      <img src={logoDataUrl} alt="" width={238} height={48} style={{ height: 48, width: 238, marginBottom: 12 }} />
      <div style={{ fontWeight: 600, fontSize: 18, color: tokens.muted, margin: 0, marginBottom: 6 }}>
        colombiando.app · Plan Clase Viva generado con IA para escuelas multigrado
      </div>
      <div style={{ fontSize: 14, color: tokens.muted, margin: 0 }}>{`Generado el ${generatedAtLabel}`}</div>
    </footer>
  );
}

function ShareGradeBadge({ grade }: { grade: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9999,
        padding: "6px 14px",
        fontWeight: 700,
        fontSize: 14,
        lineHeight: 1,
        background: gradeBg(grade),
        color: gradeText(grade),
      }}
    >
      {grade === 0 ? formatGrado(0) : `${grade}° grado`}
    </div>
  );
}

// --- Inline Lucide-style SVGs (stroke 2, currentColor). ---

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 3v4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 5h-4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17v2" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 18H3" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path
        d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path
        d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 18h6" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 22h4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" fill="none" strokeWidth="2" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
