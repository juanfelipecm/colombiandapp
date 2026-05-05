import Link from "next/link";
import { requireAdmin } from "@/lib/api/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recentMessageLogs } from "@/lib/telegram/store";

type PageProps = {
  searchParams: Promise<{
    n?: string;
    teacher?: string;
    q?: string;
  }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TelegramSpyPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = await searchParams;
  const limit = Math.min(1000, Math.max(50, parseInt(params.n ?? "250", 10) || 250));
  const teacherFilter = params.teacher && UUID_RE.test(params.teacher) ? params.teacher : null;
  const query = (params.q ?? "").trim().toLowerCase();

  const rawMessages = await recentMessageLogs(limit);
  const messages = rawMessages.filter((m) => {
    if (teacherFilter && m.teacherId !== teacherFilter) return false;
    if (query && !`${m.text} ${m.username ?? ""} ${m.firstName ?? ""} ${m.chatId}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const teacherIds = [...new Set(rawMessages.map((m) => m.teacherId).filter((id): id is string => Boolean(id)))];
  const admin = createAdminClient();
  const { data: teachers } = teacherIds.length
    ? await admin.from("teachers").select("id, first_name, last_name").in("id", teacherIds)
    : { data: [] };
  const teacherById = new Map((teachers ?? []).map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
  const teacherOptions = [...teacherById.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const grouped = groupByChat(messages);

  return (
    <div className="py-6">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Telegram spy</h1>
          <Link href="/admin/generation-logs" className="text-xs font-medium text-brand-blue">
            Generation logs
          </Link>
        </div>
        <p className="text-sm text-text-secondary">
          {messages.length} visible messages from the latest {rawMessages.length} log entries.
        </p>
      </div>

      <form method="GET" className="mb-5 space-y-3 rounded-2xl border-[1.5px] border-border bg-card-bg p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Search
          </span>
          <input
            name="q"
            defaultValue={query}
            placeholder="message, username, chat id"
            className="w-full rounded-lg border-[1.5px] border-border bg-input-bg px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
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
              {teacherOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Limit
            </span>
            <input
              type="number"
              name="n"
              min={50}
              max={1000}
              defaultValue={limit}
              className="w-full rounded-lg border-[1.5px] border-border bg-input-bg px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white">
            Apply
          </button>
          <Link href="/admin/telegram" className="rounded-lg border-[1.5px] border-border px-4 py-2 text-sm text-text-secondary">
            Reset
          </Link>
        </div>
      </form>

      <div className="space-y-4">
        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-input-bg p-5 text-center text-sm text-text-secondary">
            No Telegram messages yet.
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.chatId} className="rounded-2xl border-[1.5px] border-border bg-card-bg p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">
                  {group.teacherId ? teacherById.get(group.teacherId) ?? group.teacherId : "Unlinked chat"}
                </h2>
                <p className="text-xs text-text-secondary">
                  chat {group.chatId}
                  {group.username ? ` · @${group.username}` : ""}
                  {" · "}
                  {group.entries.length} messages
                </p>
              </div>
              <div className="space-y-2">
                {group.entries.map((m, index) => (
                  <article
                    key={`${m.ts}-${index}`}
                    className={`rounded-xl p-3 text-sm ${
                      m.direction === "in"
                        ? "bg-input-bg"
                        : m.direction === "out"
                          ? "bg-brand-blue/10"
                          : "bg-brand-red/10"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-text-secondary">
                      <span>{m.direction}</span>
                      <time>{new Date(m.ts).toLocaleString("en-US", { timeZone: "America/New_York" })}</time>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    {m.error ? <p className="mt-2 text-xs text-brand-red">{m.error}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function groupByChat(messages: Awaited<ReturnType<typeof recentMessageLogs>>) {
  const map = new Map<
    string,
    {
      chatId: string;
      teacherId?: string;
      username?: string;
      entries: Awaited<ReturnType<typeof recentMessageLogs>>;
    }
  >();

  for (const message of messages) {
    const group = map.get(message.chatId) ?? {
      chatId: message.chatId,
      teacherId: message.teacherId,
      username: message.username,
      entries: [],
    };
    if (!group.teacherId && message.teacherId) group.teacherId = message.teacherId;
    if (!group.username && message.username) group.username = message.username;
    group.entries.push(message);
    map.set(message.chatId, group);
  }

  return [...map.values()].map((g) => ({
    ...g,
    entries: g.entries.slice().sort((a, b) => b.ts - a.ts),
  }));
}
