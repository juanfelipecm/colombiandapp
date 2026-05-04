// Refactored for Satori (no className/stylesheet — every style is inline).
// Satori does not support pseudo-elements, CSS variables, CSS columns, or
// stylesheets. Colors come from lib/share-render/tokens.ts so brand vs grade
// hex values can't get conflated.
/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import type {
  ShareData,
  SharePhase,
  ShareTargetsByGrade,
} from "@/lib/share-render/load-project";
import { fitTitulo, fitPreguntaGuia } from "@/lib/share-render/text-fit";
import { tokens, gradeBg, gradeText, phaseColor } from "@/lib/share-render/tokens";

const FONT = "Montserrat";

type InfographicProps = {
  data: ShareData;
  logoDataUrl: string;
  generatedAtLabel: string;
  softCapped: boolean;
};

export function Infographic({
  data,
  logoDataUrl,
  generatedAtLabel,
  softCapped,
}: InfographicProps) {
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
      <ProductoFinal text={data.project.producto_final} />
      <PhasesSection phases={data.phases} />
      <DbasSection groups={data.targetsByGrade} />
      <MaterialesSection items={data.materiales} />
      <CierreSection
        actividad={data.project.cierre_actividad}
        evaluacion={data.project.cierre_evaluacion}
      />
      <Footer
        logoDataUrl={logoDataUrl}
        generatedAtLabel={generatedAtLabel}
        softCapped={softCapped}
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

function gradesLabel(grados: number[]): string {
  return grados.map((g) => `${g}°`).join(" · ");
}

function gradosSubtitle(grados: number[]): string {
  if (grados.length === 0) return "";
  if (grados.length === 1) return `Para grado ${grados[0]}°`;
  if (grados.length === 2) return `Para grados ${grados[0]}° y ${grados[1]}°`;
  const init = grados.slice(0, -1).map((g) => `${g}°`).join(", ");
  return `Para grados ${init} y ${grados[grados.length - 1]}°`;
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

function Cover({ data, logoDataUrl }: { data: ShareData; logoDataUrl: string }) {
  const { project, grados, studentCount } = data;
  const tituloSize = fitTitulo(project.titulo);
  const preguntaSize = fitPreguntaGuia(project.pregunta_guia);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "40px 56px 48px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <img src={logoDataUrl} alt="Colombiando" style={{ height: 80, width: "auto" }} />
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
          PLAN DE PROYECTO
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
      <div
        style={{
          fontWeight: 600,
          fontSize: 22,
          color: tokens.muted,
          margin: 0,
          marginBottom: 32,
        }}
      >
        {gradosSubtitle(grados)}
      </div>

      <Bubble preguntaGuia={project.pregunta_guia} preguntaSize={preguntaSize} />

      <div style={{ display: "flex", flexDirection: "row", gap: 16 }}>
        <Pill bg={tokens.cYellow}>{gradesLabel(grados)}</Pill>
        <Pill bg={tokens.cBlue}>
          <CalendarIcon />
          <span style={{ marginLeft: 8 }}>
            {`${project.duracion_semanas} ${project.duracion_semanas === 1 ? "semana" : "semanas"}`}
          </span>
        </Pill>
        <Pill bg={tokens.cGreen}>
          <UsersIcon />
          <span style={{ marginLeft: 8 }}>
            {`${studentCount} ${studentCount === 1 ? "niño" : "niños"}`}
          </span>
        </Pill>
      </div>
    </div>
  );
}

function Bubble({
  preguntaGuia,
  preguntaSize,
}: {
  preguntaGuia: string;
  preguntaSize: number;
}) {
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
        <span>EL RETO</span>
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: preguntaSize,
          color: tokens.black,
          lineHeight: 1.25,
          margin: 0,
        }}
      >
        {preguntaGuia}
      </div>
      {/* Black outline triangle (back) */}
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
      {/* Yellow triangle (front, inset to expose 2px of black outline) */}
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

function ProductoFinal({ text }: { text: string }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Producto final</h2>
      <div
        style={{
          display: "flex",
          background: tokens.grade2Bg,
          borderBottom: `4px solid ${tokens.black}`,
          borderRadius: 12,
          padding: "28px 28px 30px",
        }}
      >
        <div
          style={{
            fontWeight: 400,
            fontSize: 28,
            lineHeight: 1.45,
            margin: 0,
            color: tokens.black,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

function PhasesSection({ phases }: { phases: SharePhase[] }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Plan por fases</h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {phases.map((p) => (
          <PhaseBlock key={p.orden} phase={p} />
        ))}
      </div>
    </div>
  );
}

function PhaseBlock({ phase }: { phase: SharePhase }) {
  const color = phaseColor(phase.orden);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginBottom: 36,
        paddingBottom: 4,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
          marginBottom: 4,
          lineHeight: 1,
          color,
        }}
      >
        {`FASE ${phase.orden}`}
      </div>
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
      <div
        style={{
          fontWeight: 700,
          fontSize: 28,
          color: tokens.black,
          margin: 0,
          marginBottom: 4,
          lineHeight: 1.1,
        }}
      >
        {phase.nombre}
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: tokens.muted,
          margin: 0,
          marginBottom: 12,
        }}
      >
        {phase.dias_label}
      </div>
      <div
        style={{
          fontSize: 22,
          lineHeight: 1.5,
          margin: 0,
          marginBottom: 20,
          color: tokens.black,
        }}
      >
        {phase.descripcion}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {phase.byGrade.map((g, idx) => (
          <div
            key={g.grado}
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 16,
              alignItems: "flex-start",
              padding: "12px 0",
              borderTop: idx === 0 ? "none" : `1px solid ${tokens.hairline}`,
            }}
          >
            <div style={{ display: "flex", paddingTop: 4 }}>
              <ShareGradeBadge grade={g.grado} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {g.byMateria.map((m, mIdx) => (
                <div
                  key={m.materia_slug}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginBottom: mIdx === g.byMateria.length - 1 ? 0 : 14,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 20,
                      color: tokens.black,
                      margin: 0,
                      marginBottom: 4,
                    }}
                  >
                    {m.materia_nombre}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      lineHeight: 1.45,
                      margin: 0,
                      marginBottom: 4,
                      color: tokens.black,
                    }}
                  >
                    {m.tarea}
                  </div>
                  {m.evidencia_observable && m.materia_slug !== "ingles" ? (
                    <div
                      style={{
                        fontSize: 17,
                        lineHeight: 1.4,
                        color: tokens.muted,
                        margin: 0,
                      }}
                    >
                      {`Evidencia observable: ${m.evidencia_observable}`}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DbasSection({ groups }: { groups: ShareTargetsByGrade }) {
  if (groups.length === 0) return null;
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>DBAs y evidencias por grado</h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {groups.map((g) => (
          <div
            key={g.grado}
            style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 16,
                alignItems: "flex-start",
                marginBottom: 12,
              }}
            >
              <ShareGradeBadge grade={g.grado} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {g.items.map((item, idx) => (
                <div
                  key={`${g.grado}-${item.materia_slug}-${idx}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginBottom: idx === g.items.length - 1 ? 0 : 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      flexWrap: "wrap",
                      fontSize: 20,
                      lineHeight: 1.45,
                      margin: 0,
                      marginBottom: 4,
                      color: tokens.black,
                    }}
                  >
                    <span style={{ fontWeight: 700, marginRight: 6 }}>
                      {`${item.materia_nombre}:`}
                    </span>
                    <span>{`DBA #${item.dba_numero} — ${item.enunciado}`}</span>
                  </div>
                  {item.evidencia && item.materia_slug !== "ingles" ? (
                    <div
                      style={{
                        fontSize: 17,
                        lineHeight: 1.4,
                        color: tokens.muted,
                        margin: 0,
                      }}
                    >
                      {`Evidencia: ${item.evidencia}`}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialesSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  // Two-column flex (Satori has no `columns: 2`). Split items L/R round-robin
  // for visual balance — follows the natural reading order column-by-column.
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Materiales</h2>
      <div style={{ display: "flex", flexDirection: "row", gap: 32 }}>
        <MaterialesColumn items={left} />
        <MaterialesColumn items={right} />
      </div>
    </div>
  );
}

function MaterialesColumn({ items }: { items: string[] }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {items.map((m, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "row",
            marginBottom: 10,
            fontSize: 20,
            lineHeight: 1.4,
          }}
        >
          <span style={{ marginRight: 10 }}>•</span>
          <span style={{ flex: 1 }}>{m}</span>
        </div>
      ))}
    </div>
  );
}

function CierreSection({
  actividad,
  evaluacion,
}: {
  actividad: string;
  evaluacion: string;
}) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Cierre del proyecto</h2>
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: tokens.muted,
            margin: 0,
            marginBottom: 6,
          }}
        >
          ACTIVIDAD
        </div>
        <div
          style={{
            fontSize: 22,
            lineHeight: 1.5,
            margin: 0,
            color: tokens.black,
          }}
        >
          {actividad}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: tokens.muted,
            margin: 0,
            marginBottom: 6,
          }}
        >
          EVALUACIÓN
        </div>
        <div
          style={{
            fontSize: 22,
            lineHeight: 1.5,
            margin: 0,
            color: tokens.black,
          }}
        >
          {evaluacion}
        </div>
      </div>
    </div>
  );
}

function Footer({
  logoDataUrl,
  generatedAtLabel,
  softCapped,
}: {
  logoDataUrl: string;
  generatedAtLabel: string;
  softCapped: boolean;
}) {
  return (
    <footer
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "32px 56px 24px",
      }}
    >
      {softCapped ? (
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
      <img src={logoDataUrl} alt="" style={{ height: 48, width: "auto", marginBottom: 12 }} />
      <div
        style={{
          fontWeight: 600,
          fontSize: 18,
          color: tokens.muted,
          margin: 0,
          marginBottom: 6,
        }}
      >
        colombiando.app · Plan generado con IA para escuelas multigrado
      </div>
      <div style={{ fontSize: 14, color: tokens.muted, margin: 0 }}>
        {`Generado el ${generatedAtLabel}`}
      </div>
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
      {`${grade}° grado`}
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M8 2v4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 2v4" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
      <rect
        width="18"
        height="18"
        x="3"
        y="4"
        rx="2"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
      />
      <path d="M3 10h18" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
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
      <path
        d="M22 21v-2a4 4 0 0 0-3-3.87"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
