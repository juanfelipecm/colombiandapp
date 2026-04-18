import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/api/admin";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminLogDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const admin = createAdminClient();

  const { data: log } = await admin
    .from("project_generation_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!log) notFound();

  // Fetch the related attempt chain (same idempotency_key, ordered)
  const { data: chain } = await admin
    .from("project_generation_logs")
    .select("id, attempt_number, status, error_message, tokens_input, tokens_output, latency_ms, created_at")
    .eq("idempotency_key", log.idempotency_key)
    .eq("teacher_id", log.teacher_id)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });

  // Teacher + project enrichments
  const { data: teacher } = await admin
    .from("teachers")
    .select("first_name, last_name")
    .eq("id", log.teacher_id)
    .maybeSingle();

  const { data: project } = log.project_id
    ? await admin
        .from("projects")
        .select("id, titulo")
        .eq("id", log.project_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="py-6">
      <Link
        href="/admin/generation-logs"
        className="mb-4 inline-block text-sm font-medium text-brand-blue"
      >
        ◀ Back to logs
      </Link>

      <h1 className="mb-1 text-xl font-bold">Generation log</h1>
      <p className="mb-6 break-all font-mono text-[11px] text-text-secondary">{log.id}</p>

      {/* Summary card */}
      <div className="mb-6 rounded-2xl border-[1.5px] border-border bg-card-bg p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Status" value={<span className="font-semibold">{log.status}</span>} />
          <Row label="Attempt" value={String(log.attempt_number)} />
          <Row label="Created" value={new Date(log.created_at).toISOString()} />
          <Row
            label="Teacher"
            value={
              teacher
                ? `${teacher.first_name} ${teacher.last_name}`
                : log.teacher_id.slice(0, 8)
            }
          />
          <Row label="Idempotency key" value={<span className="font-mono text-[11px]">{log.idempotency_key}</span>} />
          <Row label="Prompt version" value={log.prompt_version} />
          <Row label="Model" value={log.model} />
          <Row
            label="Tokens"
            value={`${log.tokens_input ?? "—"} in / ${log.tokens_output ?? "—"} out`}
          />
          <Row
            label="Latency"
            value={log.latency_ms !== null ? `${log.latency_ms}ms` : "—"}
          />
          <Row
            label="Project"
            value={
              project ? (
                <Link
                  href={`/proyectos/${project.id}`}
                  className="font-medium text-brand-blue"
                >
                  {project.titulo} ↗
                </Link>
              ) : (
                <span className="italic text-text-placeholder">
                  (no project row — pre-insert failure or archived)
                </span>
              )
            }
          />
          {log.error_message ? (
            <Row
              label="Error"
              value={<span className="font-mono text-[11px] text-[var(--grade-3-text)]">{log.error_message}</span>}
            />
          ) : null}
        </dl>
      </div>

      {/* Attempt chain */}
      {chain && chain.length > 1 ? (
        <Section title="Attempt chain">
          <ul className="space-y-2 text-sm">
            {chain.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border border-border p-3 ${a.id === log.id ? "bg-brand-blue/5" : "bg-card-bg"}`}
              >
                <p className="text-xs text-text-secondary">
                  Attempt {a.attempt_number} · {new Date(a.created_at).toISOString()}
                </p>
                <p className="font-semibold">{a.status}</p>
                {a.error_message ? (
                  <p className="mt-1 font-mono text-[11px] text-[var(--grade-3-text)]">
                    {a.error_message}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-text-secondary">
                  {a.tokens_input ?? "—"} in / {a.tokens_output ?? "—"} out ·{" "}
                  {a.latency_ms !== null ? `${a.latency_ms}ms` : "—"}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Inputs */}
      <Section title="Inputs (wizard)">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-input-bg p-3 text-[11px] leading-relaxed">
          {JSON.stringify(log.inputs_jsonb, null, 2)}
        </pre>
      </Section>

      {/* Raw output */}
      <Section title="Raw Anthropic output">
        {log.raw_output_jsonb ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-input-bg p-3 text-[11px] leading-relaxed">
            {typeof log.raw_output_jsonb === "string"
              ? log.raw_output_jsonb
              : JSON.stringify(log.raw_output_jsonb, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-text-placeholder italic">
            No raw output captured (API error before response, or pending).
          </p>
        )}
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}
