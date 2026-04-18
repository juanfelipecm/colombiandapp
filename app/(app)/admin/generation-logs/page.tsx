import Link from "next/link";
import { requireAdmin } from "@/lib/api/admin";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  searchParams: Promise<{
    page?: string;
    status?: string;
    teacher?: string;
    from?: string;
    to?: string;
  }>;
};

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES = ["success", "pending", "validation_failed", "api_error", "timeout", "db_error"] as const;
type Status = (typeof STATUSES)[number];

export default async function AdminLogsPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const status = STATUSES.includes(params.status as Status)
    ? (params.status as Status)
    : null;
  const teacherFilter = params.teacher && UUID_RE.test(params.teacher) ? params.teacher : null;

  const defaultFrom = new Date();
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const fromIso = parseDateOrDefault(params.from, defaultFrom);
  const toIso = parseDateOrDefault(params.to, new Date());

  const admin = createAdminClient();

  let q = admin
    .from("project_generation_logs")
    .select(
      "id, project_id, teacher_id, status, prompt_version, model, tokens_input, tokens_output, latency_ms, error_message, created_at, attempt_number",
      { count: "exact" },
    )
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status) q = q.eq("status", status);
  if (teacherFilter) q = q.eq("teacher_id", teacherFilter);

  const { data: logs, count: total } = await q;

  // Enrich with teacher name + project title in a second pass
  const teacherIds = [...new Set((logs ?? []).map((l) => l.teacher_id))];
  const projectIds = [
    ...new Set((logs ?? []).map((l) => l.project_id).filter((v): v is string => v !== null)),
  ];

  const [{ data: teachers }, { data: projects }] = await Promise.all([
    teacherIds.length
      ? admin.from("teachers").select("id, first_name, last_name").in("id", teacherIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? admin.from("projects").select("id, titulo").in("id", projectIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teacherById = new Map((teachers ?? []).map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
  const projectById = new Map((projects ?? []).map((p) => [p.id, p.titulo]));

  // Distinct teachers in the 30-day window for the filter dropdown
  const { data: recentTeacherRows } = await admin
    .from("project_generation_logs")
    .select("teacher_id")
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(500);

  const recentTeacherIds = [
    ...new Set((recentTeacherRows ?? []).map((r) => r.teacher_id)),
  ];
  const { data: recentTeacherNames } = recentTeacherIds.length
    ? await admin
        .from("teachers")
        .select("id, first_name, last_name")
        .in("id", recentTeacherIds)
    : { data: [] };
  const teacherOptions = (recentTeacherNames ?? []).map((t) => ({
    id: t.id,
    name: `${t.first_name} ${t.last_name}`,
  }));

  const totalPages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Generation logs</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Prompt-tuning diary. {total ?? 0} log entries in the selected range.
        </p>
      </div>

      {/* Filter form (GET) */}
      <form method="GET" className="mb-6 space-y-3 rounded-2xl border-[1.5px] border-border bg-card-bg p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Status
            </span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="w-full rounded-lg border-[1.5px] border-border bg-input-bg px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Teacher
            </span>
            <select
              name="teacher"
              defaultValue={teacherFilter ?? ""}
              className="w-full rounded-lg border-[1.5px] border-border bg-input-bg px-3 py-2 text-sm"
            >
              <option value="">Any teacher</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              From (UTC)
            </span>
            <input
              type="date"
              name="from"
              defaultValue={fromIso.slice(0, 10)}
              className="w-full rounded-lg border-[1.5px] border-border bg-input-bg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              To (UTC)
            </span>
            <input
              type="date"
              name="to"
              defaultValue={toIso.slice(0, 10)}
              className="w-full rounded-lg border-[1.5px] border-border bg-input-bg px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white"
          >
            Apply
          </button>
          <Link
            href="/admin/generation-logs"
            className="rounded-lg border-[1.5px] border-border px-4 py-2 text-sm text-text-secondary"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Table */}
      {logs && logs.length > 0 ? (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Teacher</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Prompt / Model</th>
                <th className="px-3 py-2 font-medium text-right">Tokens</th>
                <th className="px-3 py-2 font-medium text-right">Latency</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    {formatIso(row.created_at)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {teacherById.get(row.teacher_id) ?? row.teacher_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.project_id ? (
                      projectById.get(row.project_id) ?? "(unknown project)"
                    ) : (
                      <span className="text-text-placeholder italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    {row.prompt_version}
                    <span className="ml-1 text-text-placeholder">· {row.model}</span>
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    {row.tokens_input ?? "—"} / {row.tokens_output ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    {row.latency_ms !== null ? `${row.latency_ms}ms` : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusChip status={row.status} attemptNumber={row.attempt_number} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/admin/generation-logs/${row.id}`}
                      className="font-medium text-brand-blue"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-input-bg p-8 text-center text-sm text-text-secondary">
          No log entries in the selected range.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={buildPageHref(params, page - 1)}
              className="font-medium text-brand-blue"
            >
              ◀ Prev
            </Link>
          ) : (
            <span className="text-text-placeholder">◀ Prev</span>
          )}
          <span className="text-text-secondary">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildPageHref(params, page + 1)}
              className="font-medium text-brand-blue"
            >
              Next ▶
            </Link>
          ) : (
            <span className="text-text-placeholder">Next ▶</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({
  status,
  attemptNumber,
}: {
  status: string;
  attemptNumber: number | null;
}) {
  const color =
    status === "success"
      ? "bg-brand-green/20 text-[var(--grade-5-text)]"
      : status === "pending"
        ? "bg-brand-blue/10 text-brand-blue"
        : "bg-brand-red/10 text-[var(--grade-3-text)]";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${color}`}>
      {status}
      {attemptNumber && attemptNumber > 1 ? ` ·${attemptNumber}` : ""}
    </span>
  );
}

function parseDateOrDefault(raw: string | undefined, fallback: Date): string {
  if (!raw) return fallback.toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
  return parsed.toISOString();
}

function formatIso(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19);
}

function buildPageHref(
  params: { status?: string; teacher?: string; from?: string; to?: string },
  page: number,
): string {
  const u = new URLSearchParams();
  if (params.status) u.set("status", params.status);
  if (params.teacher) u.set("teacher", params.teacher);
  if (params.from) u.set("from", params.from);
  if (params.to) u.set("to", params.to);
  u.set("page", String(page));
  return `/admin/generation-logs?${u.toString()}`;
}
