// next/image doesn't apply here: the component is renderToString-ed and
// rasterized by chromium with setContent(html). Inline <img> with a base64
// data: URL is correct.
/* eslint-disable @next/next/no-img-element */
import type { ShareData, SharePhase, ShareTargetsByGrade } from "@/lib/share-render/load-project";
import { fitTitulo, fitPreguntaGuia } from "@/lib/share-render/text-fit";

type InfographicProps = {
  data: ShareData;
  logoDataUrl: string;
  generatedAtLabel: string;
  softCapped: boolean;
};

export function Infographic({ data, logoDataUrl, generatedAtLabel, softCapped }: InfographicProps) {
  return (
    <main className="share-page">
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
    </main>
  );
}

function FlagBar() {
  return (
    <div className="flag-bar" aria-hidden>
      <div className="y" />
      <div className="b" />
      <div className="r" />
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

function Cover({ data, logoDataUrl }: { data: ShareData; logoDataUrl: string }) {
  const { project, grados, studentCount } = data;
  const tituloSize = fitTitulo(project.titulo);
  const preguntaSize = fitPreguntaGuia(project.pregunta_guia);

  return (
    <header className="cover-band">
      <div className="cover-header">
        <img src={logoDataUrl} alt="Colombiando" className="wordmark" />
        <div className="eyebrow">PLAN DE PROYECTO</div>
      </div>

      <h1 className="titulo" style={{ fontSize: `${tituloSize}px` }}>
        {project.titulo}
      </h1>
      <p className="titulo-subtitle">{gradosSubtitle(grados)}</p>

      <div className="bubble" role="note">
        <div className="bubble-eyebrow">
          <SparklesIcon />
          <span>EL RETO</span>
        </div>
        <p className="bubble-text" style={{ fontSize: `${preguntaSize}px` }}>
          {project.pregunta_guia}
        </p>
      </div>

      <div className="stat-band">
        <span className="pill pill--y">{gradesLabel(grados)}</span>
        <span className="pill pill--b">
          <CalendarIcon />
          {project.duracion_semanas} {project.duracion_semanas === 1 ? "semana" : "semanas"}
        </span>
        <span className="pill pill--g">
          <UsersIcon />
          {studentCount} {studentCount === 1 ? "niño" : "niños"}
        </span>
      </div>
    </header>
  );
}

function ProductoFinal({ text }: { text: string }) {
  return (
    <section className="section">
      <h2 className="section-heading">Producto final</h2>
      <div className="producto-card">
        <p className="producto-text">{text}</p>
      </div>
    </section>
  );
}

function PhasesSection({ phases }: { phases: SharePhase[] }) {
  return (
    <section className="section">
      <h2 className="section-heading">Plan por fases</h2>
      {phases.map((p) => (
        <PhaseBlock key={p.orden} phase={p} />
      ))}
    </section>
  );
}

function PhaseBlock({ phase }: { phase: SharePhase }) {
  const phaseClass = `phase-block phase--${phase.orden}`;
  return (
    <article className={phaseClass}>
      <p className="phase-eyebrow">FASE {phase.orden}</p>
      <p className="phase-numeral">{phase.orden}</p>
      <div className="phase-hairline" aria-hidden />
      <h3 className="phase-name">{phase.nombre}</h3>
      <p className="phase-dias">{phase.dias_label}</p>
      <p className="phase-desc">{phase.descripcion}</p>
      {phase.byGrade.map((g) => (
        <div key={g.grado} className="phase-grade">
          <span className="phase-grade-badge">
            <ShareGradeBadge grade={g.grado} />
          </span>
          <div className="phase-grade-content">
            {g.byMateria.map((m) => (
              <div key={m.materia_slug} className="phase-materia">
                <p className="phase-materia-name">{m.materia_nombre}</p>
                <p className="phase-materia-tarea">{m.tarea}</p>
                {m.evidencia_observable && m.materia_slug !== "ingles" ? (
                  <p className="phase-materia-evidencia">
                    Evidencia observable: {m.evidencia_observable}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </article>
  );
}

function DbasSection({ groups }: { groups: ShareTargetsByGrade }) {
  if (groups.length === 0) return null;
  return (
    <section className="section">
      <h2 className="section-heading">DBAs y evidencias por grado</h2>
      {groups.map((g) => (
        <div key={g.grado} className="dbas-block">
          <div className="dbas-grade-row">
            <ShareGradeBadge grade={g.grado} />
          </div>
          {g.items.map((item, idx) => (
            <div key={`${g.grado}-${item.materia_slug}-${idx}`} className="dba-item">
              <p className="dba-materia-line">
                <strong>{item.materia_nombre}:</strong> DBA #{item.dba_numero} — {item.enunciado}
              </p>
              {item.evidencia && item.materia_slug !== "ingles" ? (
                <p className="dba-evidencia">Evidencia: {item.evidencia}</p>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function MaterialesSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2 className="section-heading">Materiales</h2>
      <ul className="materiales-list">
        {items.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </section>
  );
}

function CierreSection({ actividad, evaluacion }: { actividad: string; evaluacion: string }) {
  return (
    <section className="section">
      <h2 className="section-heading">Cierre del proyecto</h2>
      <div className="cierre-sub">
        <p className="cierre-eyebrow">ACTIVIDAD</p>
        <p className="cierre-text">{actividad}</p>
      </div>
      <div className="cierre-sub">
        <p className="cierre-eyebrow">EVALUACIÓN</p>
        <p className="cierre-text">{evaluacion}</p>
      </div>
    </section>
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
    <footer className="footer">
      {softCapped ? (
        <p className="footer-soft-cap">
          PLAN COMPLETO EN EL PDF · descárgalo desde la app
        </p>
      ) : null}
      <img src={logoDataUrl} alt="" className="footer-wordmark" aria-hidden />
      <p className="footer-tagline">
        colombiando.app · Plan generado con IA para escuelas multigrado
      </p>
      <p className="footer-timestamp">Generado el {generatedAtLabel}</p>
    </footer>
  );
}

function ShareGradeBadge({ grade }: { grade: number }) {
  return <span className={`grade-badge grade-badge--${grade}`}>{grade}° grado</span>;
}

// --- Inline Lucide-style SVGs (stroke 2, currentColor). Avoids any external
// font/icon dependency in the rendered HTML. ---

function SparklesIcon() {
  return (
    <svg className="lucide" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="lucide" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="lucide" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
